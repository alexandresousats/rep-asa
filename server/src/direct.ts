import type { Context } from "hono";
import type { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { normalizeChannelMessage } from "./channels";
import { uid } from "./crypto";
import { prisma } from "./db";
import { assertWritable, notify, type Actor } from "./domain";
import { ApiError } from "./errors";
import { publish } from "./events";
import { assertDirectOpenRate, assertDirectPostRate } from "./rate-limit";

const ID = /^[A-Za-z0-9_-]{1,40}$/;

type PeerUser = {
  id: string;
  name: string;
  initials: string;
  role: string;
  avatar: string | null;
};

function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "Dados inválidos.");
  return result.data;
}

function uniquePair(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function pairOf(left: string, right: string) {
  return left < right
    ? { userLowId: left, userHighId: right }
    : { userLowId: right, userHighId: left };
}

function previewOf(body: string) {
  return body.replace(/\s+/g, " ").trim().slice(0, 80);
}

function publicAvatar(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500_000) return null;
  const head = trimmed.slice(0, 32).toLowerCase();
  if (
    head.startsWith("javascript:") ||
    head.startsWith("vbscript:") ||
    head.startsWith("data:text") ||
    head.startsWith("data:image/svg") ||
    trimmed.startsWith("//")
  ) {
    return null;
  }
  return trimmed;
}

function publicPeer(user: PeerUser, role: string) {
  return {
    id: user.id,
    name: user.name.slice(0, 120),
    initials: user.initials.slice(0, 8),
    role: role.slice(0, 80),
    avatar: publicAvatar(user.avatar),
  };
}

function publicConversation(
  row: {
    id: string;
    lastPreview: string;
    lastAuthorId: string | null;
    lastMessageAt: Date | null;
    createdAt: Date;
  },
  peer: PeerUser,
  role: string,
) {
  return {
    id: row.id,
    peer: publicPeer(peer, role),
    lastPreview: row.lastPreview,
    lastAuthorId: row.lastAuthorId,
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function publicMessage(message: {
  id: string;
  conversationId: string;
  authorId: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
}) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    authorId: message.authorId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt ? message.editedAt.toISOString() : null,
  };
}

async function activeTeamMember(actor: Actor) {
  if (!actor.workspaceId) {
    throw new ApiError(403, "Aceite o convite para entrar num espaço de trabalho.");
  }
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: actor.id } },
  });
  if (!member || member.status !== "active") {
    throw new ApiError(403, "Aceite o convite para ver as mensagens deste espaço.");
  }
  if (member.access === "cliente") {
    throw new ApiError(403, "As mensagens ficam só com a equipe convidada.");
  }
  return member;
}

async function peerMemberships(actor: Actor) {
  const member = await activeTeamMember(actor);
  const workspaceId = actor.workspaceId!;
  const base = {
    workspaceId,
    status: "active" as const,
    access: { not: "cliente" as const },
    userId: { not: actor.id },
  };
  if (member.access !== "admin") {
    const projects = await prisma.projectMember.findMany({
      where: { userId: actor.id, project: { workspaceId } },
      select: { projectId: true },
    });
    const mates = await prisma.projectMember.findMany({
      where: {
        projectId: { in: projects.map((item) => item.projectId) },
        userId: { not: actor.id },
      },
      select: { userId: true },
    });
    const ids = [...new Set(mates.map((item) => item.userId))];
    if (ids.length === 0) return [];
    return prisma.workspaceMember.findMany({
      where: { ...base, userId: { in: ids } },
      include: { user: true },
    });
  }
  return prisma.workspaceMember.findMany({
    where: base,
    include: { user: true },
  });
}

async function assertCanMessage(actor: Actor, targetId: string) {
  await activeTeamMember(actor);
  if (!ID.test(targetId) || targetId === actor.id) {
    throw new ApiError(400, "Escolha outra pessoa da equipe.");
  }
  const peers = await peerMemberships(actor);
  const match = peers.find((item) => item.userId === targetId);
  if (!match) throw new ApiError(404, "Pessoa não encontrada.");
  return match;
}

const conversationInclude = { userLow: true, userHigh: true } as const;

function peerFor(
  actorId: string,
  row: { userLowId: string; userHighId: string; userLow: PeerUser; userHigh: PeerUser },
) {
  return row.userLowId === actorId ? row.userHigh : row.userLow;
}

async function visibleConversation(actor: Actor, id: string) {
  await activeTeamMember(actor);
  if (!ID.test(id)) throw new ApiError(404, "Conversa não encontrada.");
  const row = await prisma.directConversation.findFirst({
    where: {
      id,
      workspaceId: actor.workspaceId!,
      OR: [{ userLowId: actor.id }, { userHighId: actor.id }],
    },
    include: conversationInclude,
  });
  if (!row) throw new ApiError(404, "Conversa não encontrada.");
  return row;
}

async function workspaceRoles(workspaceId: string, userIds: string[]) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map<string, string>();
  const rows = await prisma.workspaceMember.findMany({
    where: { workspaceId, userId: { in: ids } },
    select: { userId: true, role: true },
  });
  return new Map(rows.map((row) => [row.userId, row.role]));
}

async function emitConversation(row: {
  id: string;
  workspaceId: string;
  userLowId: string;
  userHighId: string;
  lastPreview: string;
  lastAuthorId: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  userLow: PeerUser;
  userHigh: PeerUser;
}) {
  const roles = await workspaceRoles(row.workspaceId, [row.userLowId, row.userHighId]);
  publish({
    workspaceId: row.workspaceId,
    kind: "direct",
    audience: [row.userLowId],
    conversation: publicConversation(row, row.userHigh, roles.get(row.userHighId) ?? ""),
  });
  publish({
    workspaceId: row.workspaceId,
    kind: "direct",
    audience: [row.userHighId],
    conversation: publicConversation(row, row.userLow, roles.get(row.userLowId) ?? ""),
  });
}

export async function listDirectConversations(actor: Actor) {
  await activeTeamMember(actor);
  const rows = await prisma.directConversation.findMany({
    where: {
      workspaceId: actor.workspaceId!,
      OR: [{ userLowId: actor.id }, { userHighId: actor.id }],
      messages: { some: {} },
    },
    include: conversationInclude,
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  const roles = await workspaceRoles(
    actor.workspaceId!,
    rows.flatMap((row) => [row.userLowId, row.userHighId]),
  );
  return rows.map((row) => {
    const peer = peerFor(actor.id, row);
    return publicConversation(row, peer, roles.get(peer.id) ?? "");
  });
}

export async function listDirectPeers(actor: Actor) {
  const rows = await peerMemberships(actor);
  return rows
    .map((row) => publicPeer(row.user, row.role))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 200);
}

export async function getDirectConversation(actor: Actor, id: string) {
  const row = await visibleConversation(actor, id);
  const peer = peerFor(actor.id, row);
  const roles = await workspaceRoles(row.workspaceId, [peer.id]);
  return publicConversation(row, peer, roles.get(peer.id) ?? "");
}

export async function listDirectMessages(
  actor: Actor,
  conversationId: string,
  query: { limit?: number; before?: string },
) {
  const conversation = await visibleConversation(actor, conversationId);
  const limit = query.limit ?? 50;
  let cursor: { createdAt: Date; id: string } | null = null;
  if (query.before) {
    if (!ID.test(query.before)) throw new ApiError(400, "Página inválida.");
    cursor = await prisma.directMessage.findFirst({
      where: { id: query.before, conversationId: conversation.id },
      select: { createdAt: true, id: true },
    });
    if (!cursor) throw new ApiError(400, "Página inválida.");
  }
  const rows = await prisma.directMessage.findMany({
    where: {
      conversationId: conversation.id,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return {
    messages: page.map(publicMessage),
    nextCursor: hasMore ? (page[0]?.id ?? null) : null,
  };
}

async function writeMessage(
  actor: Actor,
  targetId: string,
  body: string,
) {
  const workspaceId = actor.workspaceId!;
  const keys = pairOf(actor.id, targetId);
  const text = normalizeChannelMessage(body);
  const existing = await prisma.directConversation.findUnique({
    where: { workspaceId_userLowId_userHighId: { workspaceId, ...keys } },
    select: { id: true },
  });
  if (!existing) await assertDirectOpenRate(actor.id);
  await assertDirectPostRate(actor.id);

  const save = () =>
    prisma.$transaction(async (tx) => {
      let conversation = await tx.directConversation.findUnique({
        where: { workspaceId_userLowId_userHighId: { workspaceId, ...keys } },
      });
      if (!conversation) {
        conversation = await tx.directConversation.create({
          data: {
            id: uid("dc"),
            workspaceId,
            ...keys,
            openedById: actor.id,
          },
        });
      }
      const message = await tx.directMessage.create({
        data: {
          id: uid("dm"),
          conversationId: conversation.id,
          authorId: actor.id,
          body: text,
        },
      });
      const updated = await tx.directConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: message.createdAt,
          lastAuthorId: actor.id,
          lastPreview: previewOf(text),
        },
        include: conversationInclude,
      });
      return { conversation: updated, message };
    });

  try {
    return await save();
  } catch (error) {
    if (!uniquePair(error)) throw error;
    return save();
  }
}

export async function sendDirectMessage(actor: Actor, userId: string, body: string) {
  const membership = await assertCanMessage(actor, userId);
  assertWritable(actor);
  const { conversation, message } = await writeMessage(actor, membership.user.id, body);
  const payload = publicMessage(message);
  const audience = [conversation.userLowId, conversation.userHighId];
  await emitConversation(conversation);
  publish({
    workspaceId: conversation.workspaceId,
    kind: "direct-message",
    audience,
    message: payload,
  });
  const recipientId = audience.find((id) => id !== actor.id);
  if (recipientId) {
    await notify({
      userId: recipientId,
      workspaceId: conversation.workspaceId,
      type: "direct",
      title: actor.name.slice(0, 80),
      body: "Mensagem privada",
      href: `/mensagens/d/${conversation.id}`,
    });
  }
  return {
    conversation: publicConversation(conversation, membership.user, membership.role),
    message: payload,
  };
}

async function refreshPreview(conversationId: string) {
  const latest = await prisma.directMessage.findFirst({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return prisma.directConversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: latest?.createdAt ?? null,
      lastAuthorId: latest?.authorId ?? null,
      lastPreview: latest ? previewOf(latest.body) : "",
    },
    include: conversationInclude,
  });
}

export async function editDirectMessage(
  actor: Actor,
  conversationId: string,
  messageId: string,
  body: string,
) {
  const conversation = await visibleConversation(actor, conversationId);
  assertWritable(actor);
  if (!ID.test(messageId)) throw new ApiError(404, "Mensagem não encontrada.");
  const current = await prisma.directMessage.findFirst({
    where: { id: messageId, conversationId: conversation.id },
  });
  if (!current) throw new ApiError(404, "Mensagem não encontrada.");
  if (current.authorId !== actor.id) {
    throw new ApiError(403, "Você só pode editar as suas mensagens.");
  }
  const text = normalizeChannelMessage(body);
  const message = await prisma.directMessage.update({
    where: { id: current.id },
    data: { body: text, editedAt: new Date() },
  });
  const updated = await refreshPreview(conversation.id);
  const payload = publicMessage(message);
  await emitConversation(updated);
  publish({
    workspaceId: updated.workspaceId,
    kind: "direct-message",
    audience: [updated.userLowId, updated.userHighId],
    message: payload,
  });
  return payload;
}

export async function deleteDirectMessage(actor: Actor, conversationId: string, messageId: string) {
  const conversation = await visibleConversation(actor, conversationId);
  assertWritable(actor);
  if (!ID.test(messageId)) throw new ApiError(404, "Mensagem não encontrada.");
  const current = await prisma.directMessage.findFirst({
    where: { id: messageId, conversationId: conversation.id },
  });
  if (!current) throw new ApiError(404, "Mensagem não encontrada.");
  if (current.authorId !== actor.id) {
    throw new ApiError(403, "Você só pode apagar as suas mensagens.");
  }
  await prisma.directMessage.delete({ where: { id: current.id } });
  const updated = await refreshPreview(conversation.id);
  const audience = [updated.userLowId, updated.userHighId];
  const remaining = await prisma.directMessage.count({ where: { conversationId: updated.id } });
  if (remaining === 0) {
    publish({
      workspaceId: updated.workspaceId,
      kind: "direct-removed",
      audience,
      conversationId: updated.id,
    });
  } else {
    await emitConversation(updated);
  }
  publish({
    workspaceId: updated.workspaceId,
    kind: "direct-message-removed",
    audience,
    conversationId: updated.id,
    messageId: current.id,
  });
}

function messageQuery(c: Context) {
  const before = c.req.query("before");
  if (before && before.length > 40) throw new ApiError(400, "Dados inválidos.");
  const limitRaw = c.req.query("limit");
  let limit: number | undefined;
  if (limitRaw !== undefined) {
    if (!/^\d+$/.test(limitRaw)) throw new ApiError(400, "Dados inválidos.");
    limit = Number(limitRaw);
    if (limit < 1 || limit > 100) throw new ApiError(400, "Dados inválidos.");
  }
  return { limit, before };
}

const sendBody = z.object({
  userId: z.string().regex(ID),
  body: z.string().max(8000),
});

async function privateHeaders(c: Context, next: () => Promise<void>) {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
  await next();
}

export function registerDirectRoutes(
  app: Hono,
  deps: { actorOf: (c: Context) => Promise<Actor> },
) {
  app.use("/direct", privateHeaders);
  app.use("/direct/*", privateHeaders);

  app.get("/direct", async (c) => c.json(await listDirectConversations(await deps.actorOf(c))));

  app.get("/direct/peers", async (c) => c.json(await listDirectPeers(await deps.actorOf(c))));

  app.post("/direct/messages", async (c) => {
    const body = parse(sendBody, await c.req.json());
    return c.json(await sendDirectMessage(await deps.actorOf(c), body.userId, body.body));
  });

  app.get("/direct/:id", async (c) =>
    c.json(await getDirectConversation(await deps.actorOf(c), c.req.param("id"))),
  );

  app.get("/direct/:id/messages", async (c) =>
    c.json(await listDirectMessages(await deps.actorOf(c), c.req.param("id"), messageQuery(c))),
  );

  app.patch("/direct/:id/messages/:messageId", async (c) => {
    const body = parse(z.object({ body: z.string().max(8000) }), await c.req.json());
    return c.json(
      await editDirectMessage(await deps.actorOf(c), c.req.param("id"), c.req.param("messageId"), body.body),
    );
  });

  app.delete("/direct/:id/messages/:messageId", async (c) => {
    await deleteDirectMessage(await deps.actorOf(c), c.req.param("id"), c.req.param("messageId"));
    return c.json({ ok: true });
  });
}
