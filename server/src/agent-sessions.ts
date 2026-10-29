import type { Prisma } from "@prisma/client";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { randomToken } from "./crypto";
import { prisma } from "./db";
import type { Actor } from "./domain";
import { ApiError } from "./errors";
import { assertStorageAvailable, jsonBytes, workspaceStorageUsage } from "./storage";

const TRASH_MS = 30 * 24 * 60 * 60 * 1000;
const NOT_FOUND = "Conversa não encontrada.";
const OWNER_ONLY = "Só quem criou a conversa pode fazer isso.";

const id = z.string().min(1).max(120);
const message = z
  .object({
    id,
    role: z.enum(["user", "assistant"]),
    content: z.string().max(400_000),
    createdAt: z.string().max(40),
    pending: z.boolean().optional(),
  })
  .passthrough();
type MessageData = z.infer<typeof message>;

const upsertBody = z.object({
  title: z.string().max(200).optional(),
  folderId: z.string().max(120).nullable().optional(),
  messages: z.array(message).max(200),
});
const replaceBody = z.object({ messages: z.array(message).max(2000) });
const patchBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  folderId: z.string().max(120).nullable().optional(),
  deletedAt: z.string().max(40).nullable().optional(),
});
const folder = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  color: z.string().max(40).optional(),
  createdAt: z.string().max(40).optional(),
});
const foldersBody = z.object({ folders: z.array(folder).max(200) });
const importBody = z.object({
  folders: z.array(folder).max(200).default([]),
  sessions: z
    .array(
      z.object({
        id,
        title: z.string().max(200).default("Nova conversa"),
        folderId: z.string().max(120).nullable().optional(),
        createdAt: z.string().max(40).optional(),
        updatedAt: z.string().max(40).optional(),
        deletedAt: z.string().max(40).nullable().optional(),
        messages: z.array(message).max(2000).default([]),
      }),
    )
    .max(500),
});
const sharingBody = z.object({
  enabled: z.boolean().optional(),
  members: z.array(z.object({ userId: id, shared: z.boolean() })).max(500).optional(),
});

function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "Dados inválidos.");
  return result.data;
}

async function readBody(c: Context) {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError(400, "Dados inválidos.");
  }
}

function workspaceOf(actor: Actor) {
  if (!actor.workspaceId) throw new ApiError(403, "Aceite o convite para entrar num espaço de trabalho.");
  return actor.workspaceId;
}

function date(value: string | null | undefined, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

// Quem tem acesso de cliente fica de fora até o admin incluir a pessoa pelo nome.
export function memberShares(member: { agentChatShared: boolean | null; access: string }) {
  return member.agentChatShared ?? member.access !== "cliente";
}

// Ids de quem participa do compartilhamento agora; vazio quando o espaço não compartilha.
export async function sharingMemberIds(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { agentChatSharing: true },
  });
  if (!workspace?.agentChatSharing) return new Set<string>();
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, status: "active" },
    select: { userId: true, agentChatShared: true, access: true },
  });
  return new Set(members.filter(memberShares).map((member) => member.userId));
}

async function openSession(actor: Actor, sessionId: string, mode: "read" | "write" | "own") {
  const workspaceId = workspaceOf(actor);
  const session = await prisma.agentSession.findUnique({ where: { id: sessionId } });
  if (!session) return null;
  // Id de outro espaço: responde como inexistente, sem criar nada por cima.
  if (session.workspaceId !== workspaceId) throw new ApiError(404, NOT_FOUND);
  if (session.userId === actor.id) return { session, owner: true };
  // A conversa de outra pessoa só aparece quando as duas participam do compartilhamento.
  const sharing = await sharingMemberIds(workspaceId);
  if (session.deletedAt || !sharing.has(actor.id) || !sharing.has(session.userId)) {
    throw new ApiError(404, NOT_FOUND);
  }
  if (mode === "own") throw new ApiError(403, OWNER_ONLY);
  return { session, owner: false };
}

function sessionSummary(session: {
  id: string;
  title: string;
  folderId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: session.id,
    title: session.title,
    folderId: session.folderId,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    deletedAt: session.deletedAt?.toISOString() ?? null,
  };
}

async function namesOf(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(users.map((user) => [user.id, user.name]));
}

export async function listAgentSessions(actor: Actor) {
  const workspaceId = workspaceOf(actor);
  await prisma.agentSession.deleteMany({
    where: { workspaceId, userId: actor.id, deletedAt: { lt: new Date(Date.now() - TRASH_MS) } },
  });
  const sharing = await sharingMemberIds(workspaceId);
  const canShare = sharing.has(actor.id);
  const others = [...sharing].filter((userId) => userId !== actor.id);
  const [own, folders, team] = await Promise.all([
    prisma.agentSession.findMany({
      where: { workspaceId, userId: actor.id },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.agentFolder.findMany({
      where: { workspaceId, userId: actor.id },
      orderBy: { createdAt: "asc" },
    }),
    canShare && others.length
      ? prisma.agentSession.findMany({
          where: {
            workspaceId,
            userId: { in: others },
            deletedAt: null,
            messages: { some: {} },
          },
          orderBy: { updatedAt: "desc" },
          take: 200,
        })
      : Promise.resolve([]),
  ]);
  const names = await namesOf(team.map((session) => session.userId));
  return {
    sharing: { enabled: canShare },
    folders: folders.map((item) => ({
      id: item.id,
      name: item.name,
      color: item.color,
      createdAt: item.createdAt.toISOString(),
    })),
    sessions: own.map(sessionSummary),
    team: team.map((session) => ({
      ...sessionSummary(session),
      folderId: null,
      ownerId: session.userId,
      ownerName: names.get(session.userId) ?? "Alguém da equipe",
    })),
  };
}

export async function readAgentSession(actor: Actor, sessionId: string) {
  const opened = await openSession(actor, sessionId, "read");
  if (!opened) throw new ApiError(404, NOT_FOUND);
  const rows = await prisma.agentMessage.findMany({
    where: { sessionId },
    orderBy: { seq: "asc" },
  });
  const names = await namesOf([opened.session.userId, ...rows.map((row) => row.authorId ?? "")]);
  return {
    ...sessionSummary(opened.session),
    ownerId: opened.session.userId,
    ownerName: names.get(opened.session.userId) ?? "",
    owner: opened.owner,
    messages: rows.map((row) => ({
      ...(row.data as Prisma.JsonObject),
      authorId: row.authorId,
      authorName: row.authorId ? (names.get(row.authorId) ?? null) : null,
    })),
  };
}

// Autor e nome são do servidor; o que vier do navegador nesses campos é descartado.
function storable(data: MessageData) {
  const rest: Record<string, unknown> = { ...data };
  delete rest.authorId;
  delete rest.authorName;
  return rest as Prisma.InputJsonObject;
}

function sameJson(left: unknown, right: unknown) {
  const sort = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.keys(value as object)
          .sort()
          .map((key) => [key, sort((value as Record<string, unknown>)[key])]),
      );
    }
    return value;
  };
  return JSON.stringify(sort(left)) === JSON.stringify(sort(right));
}

// Acrescenta ou atualiza mensagens pelo id. Quem não é dono só cria mensagens novas e
// termina as respostas que ele mesmo começou; nunca apaga nem reescreve as dos outros.
export async function upsertAgentMessages(actor: Actor, sessionId: string, input: unknown) {
  const workspaceId = workspaceOf(actor);
  const body = parse(upsertBody, input);
  let opened = await openSession(actor, sessionId, "write");
  if (!opened) {
    const session = await prisma.agentSession.create({
      data: {
        id: sessionId,
        workspaceId,
        userId: actor.id,
        title: body.title?.trim() || "Nova conversa",
        folderId: body.folderId ?? null,
      },
    });
    opened = { session, owner: true };
  }
  const stored = await prisma.agentMessage.findMany({
    where: { sessionId, id: { in: body.messages.map((item) => item.id) } },
  });
  const byId = new Map(stored.map((row) => [row.id, row]));
  const hadMessages = await prisma.agentMessage.count({ where: { sessionId } });
  await assertStorageAvailable(
    workspaceId,
    body.messages.reduce(
      (total, item) => total + jsonBytes(storable(item)) - (byId.get(item.id)?.size ?? 0),
      0,
    ),
  );

  await prisma.$transaction(async (tx) => {
    for (const item of body.messages) {
      const data = storable(item);
      const current = byId.get(item.id);
      if (!current) {
        await tx.agentMessage.create({
          data: { sessionId, id: item.id, authorId: actor.id, data, size: jsonBytes(data) },
        });
        continue;
      }
      if (sameJson(current.data, data)) continue;
      const ownPending =
        current.authorId === actor.id && (current.data as { pending?: boolean }).pending === true;
      if (!opened.owner && !ownPending) {
        throw new ApiError(403, "Não é possível alterar mensagens da conversa de outra pessoa.");
      }
      await tx.agentMessage.update({
        where: { sessionId_id: { sessionId, id: item.id } },
        data: { data, size: jsonBytes(data) },
      });
    }
    await tx.agentSession.update({
      where: { id: sessionId },
      data: {
        updatedAt: new Date(),
        ...(opened.owner && hadMessages === 0 && body.title?.trim()
          ? { title: body.title.trim() }
          : {}),
      },
    });
  });
  return { ok: true };
}

export async function replaceAgentMessages(actor: Actor, sessionId: string, input: unknown) {
  const body = parse(replaceBody, input);
  const opened = await openSession(actor, sessionId, "own");
  if (!opened) throw new ApiError(404, NOT_FOUND);
  const previous = await prisma.agentMessage.findMany({
    where: { sessionId },
    select: { id: true, authorId: true, size: true },
  });
  await assertStorageAvailable(
    opened.session.workspaceId,
    body.messages.reduce((total, item) => total + jsonBytes(storable(item)), 0) -
      previous.reduce((total, row) => total + row.size, 0),
  );
  const authors = new Map(previous.map((row) => [row.id, row.authorId]));
  await prisma.$transaction([
    prisma.agentMessage.deleteMany({ where: { sessionId } }),
    ...body.messages.map((item) =>
      prisma.agentMessage.create({
        data: {
          sessionId,
          id: item.id,
          authorId: authors.get(item.id) ?? actor.id,
          data: storable(item),
          size: jsonBytes(storable(item)),
        },
      }),
    ),
    prisma.agentSession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } }),
  ]);
  return { ok: true };
}

export async function deleteAgentMessage(actor: Actor, sessionId: string, messageId: string) {
  const opened = await openSession(actor, sessionId, "own");
  if (!opened) throw new ApiError(404, NOT_FOUND);
  await prisma.agentMessage.deleteMany({ where: { sessionId, id: messageId } });
  return { ok: true };
}

export async function patchAgentSession(actor: Actor, sessionId: string, input: unknown) {
  const workspaceId = workspaceOf(actor);
  const body = parse(patchBody, input);
  const opened = await openSession(actor, sessionId, "own");
  const data = {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
    ...(body.deletedAt !== undefined
      ? { deletedAt: body.deletedAt ? date(body.deletedAt, new Date()) : null }
      : {}),
  };
  if (!opened) {
    await prisma.agentSession.create({
      data: { id: sessionId, workspaceId, userId: actor.id, ...data },
    });
    return { ok: true };
  }
  await prisma.agentSession.update({ where: { id: sessionId }, data: { ...data, updatedAt: new Date() } });
  return { ok: true };
}

export async function purgeAgentSession(actor: Actor, sessionId: string) {
  const opened = await openSession(actor, sessionId, "own");
  if (opened) await prisma.agentSession.delete({ where: { id: sessionId } });
  return { ok: true };
}

export async function saveAgentFolders(actor: Actor, input: unknown) {
  const workspaceId = workspaceOf(actor);
  const body = parse(foldersBody, input);
  const ids = body.folders.map((item) => item.id);
  const taken = await prisma.agentFolder.findMany({
    where: { id: { in: ids }, NOT: { workspaceId, userId: actor.id } },
    select: { id: true },
  });
  if (taken.length) throw new ApiError(409, "Pasta inválida.");
  await prisma.$transaction([
    prisma.agentFolder.deleteMany({ where: { workspaceId, userId: actor.id, id: { notIn: ids } } }),
    ...body.folders.map((item) =>
      prisma.agentFolder.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          workspaceId,
          userId: actor.id,
          name: item.name,
          color: item.color || "#6366f1",
          createdAt: date(item.createdAt, new Date()),
        },
        update: { name: item.name, color: item.color || "#6366f1" },
      }),
    ),
    prisma.agentSession.updateMany({
      where: { workspaceId, userId: actor.id, folderId: { notIn: ids } },
      data: { folderId: null },
    }),
  ]);
  return { ok: true };
}

// Leva para a conta as conversas que estavam só no navegador. Ids que já existem
// em outra conta ganham id novo para não misturar conversas.
export async function importAgentSessions(actor: Actor, input: unknown) {
  const workspaceId = workspaceOf(actor);
  const body = parse(importBody, input);
  const folderIds = new Map<string, string>();
  const existingFolders = await prisma.agentFolder.findMany({
    where: { id: { in: body.folders.map((item) => item.id) } },
    select: { id: true, userId: true, workspaceId: true },
  });
  const folderOwner = new Map(existingFolders.map((item) => [item.id, item]));
  for (const item of body.folders) {
    const found = folderOwner.get(item.id);
    if (found && found.userId === actor.id && found.workspaceId === workspaceId) {
      folderIds.set(item.id, item.id);
      continue;
    }
    const nextId = found ? `fld-${randomToken().slice(0, 16)}` : item.id;
    await prisma.agentFolder.create({
      data: {
        id: nextId,
        workspaceId,
        userId: actor.id,
        name: item.name,
        color: item.color || "#6366f1",
        createdAt: date(item.createdAt, new Date()),
      },
    });
    folderIds.set(item.id, nextId);
  }

  await assertStorageAvailable(
    workspaceId,
    body.sessions.reduce(
      (total, item) =>
        total + item.messages.reduce((sum, entry) => sum + jsonBytes(storable(entry)), 0),
      0,
    ),
  );
  const existing = await prisma.agentSession.findMany({
    where: { id: { in: body.sessions.map((item) => item.id) } },
    select: { id: true, userId: true, workspaceId: true },
  });
  const sessionOwner = new Map(existing.map((item) => [item.id, item]));
  let imported = 0;
  for (const item of body.sessions) {
    if (item.messages.length === 0) continue;
    const found = sessionOwner.get(item.id);
    if (found && found.userId === actor.id && found.workspaceId === workspaceId) continue;
    const sessionId = found ? `sess-${randomToken().slice(0, 20)}` : item.id;
    const now = new Date();
    await prisma.$transaction([
      prisma.agentSession.create({
        data: {
          id: sessionId,
          workspaceId,
          userId: actor.id,
          title: item.title.trim() || "Nova conversa",
          folderId: item.folderId ? (folderIds.get(item.folderId) ?? null) : null,
          createdAt: date(item.createdAt, now),
          updatedAt: date(item.updatedAt, now),
          deletedAt: item.deletedAt ? date(item.deletedAt, now) : null,
        },
      }),
      ...item.messages.map((entry) =>
        prisma.agentMessage.create({
          data: {
            sessionId,
            id: entry.id,
            authorId: actor.id,
            data: storable({ ...entry, pending: false }),
            size: jsonBytes(storable({ ...entry, pending: false })),
          },
        }),
      ),
    ]);
    imported += 1;
  }
  return { ok: true, imported };
}

function assertAdmin(actor: Actor) {
  workspaceOf(actor);
  if (actor.access !== "admin") throw new ApiError(403, "Só um administrador pode fazer isso.");
}

export async function readAgentSharing(actor: Actor) {
  assertAdmin(actor);
  const workspaceId = actor.workspaceId!;
  const [workspace, members] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { agentChatSharing: true } }),
    prisma.workspaceMember.findMany({
      where: { workspaceId, status: "active" },
      select: {
        userId: true,
        access: true,
        owner: true,
        agentChatShared: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    enabled: workspace?.agentChatSharing ?? false,
    members: members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      access: member.access,
      owner: member.owner,
      shared: memberShares(member),
    })),
  };
}

export async function saveAgentSharing(actor: Actor, input: unknown) {
  assertAdmin(actor);
  const workspaceId = actor.workspaceId!;
  const body = parse(sharingBody, input);
  await prisma.$transaction([
    ...(body.enabled !== undefined
      ? [prisma.workspace.update({ where: { id: workspaceId }, data: { agentChatSharing: body.enabled } })]
      : []),
    ...(body.members ?? []).map((member) =>
      prisma.workspaceMember.updateMany({
        where: { workspaceId, userId: member.userId },
        data: { agentChatShared: member.shared },
      }),
    ),
  ]);
  return readAgentSharing(actor);
}

export function registerAgentSessionRoutes(
  app: Hono,
  deps: { actorOf: (c: Context) => Promise<Actor> },
) {
  app.get("/agent/sessions", async (c) => c.json(await listAgentSessions(await deps.actorOf(c))));
  app.get("/agent/sessions/:id", async (c) =>
    c.json(await readAgentSession(await deps.actorOf(c), c.req.param("id"))),
  );
  app.post("/agent/sessions/:id/messages", async (c) =>
    c.json(await upsertAgentMessages(await deps.actorOf(c), c.req.param("id"), await readBody(c))),
  );
  app.put("/agent/sessions/:id/messages", async (c) =>
    c.json(await replaceAgentMessages(await deps.actorOf(c), c.req.param("id"), await readBody(c))),
  );
  app.delete("/agent/sessions/:id/messages/:messageId", async (c) =>
    c.json(
      await deleteAgentMessage(await deps.actorOf(c), c.req.param("id"), c.req.param("messageId")),
    ),
  );
  app.patch("/agent/sessions/:id", async (c) =>
    c.json(await patchAgentSession(await deps.actorOf(c), c.req.param("id"), await readBody(c))),
  );
  app.delete("/agent/sessions/:id", async (c) =>
    c.json(await purgeAgentSession(await deps.actorOf(c), c.req.param("id"))),
  );
  app.put("/agent/folders", async (c) =>
    c.json(await saveAgentFolders(await deps.actorOf(c), await readBody(c))),
  );
  app.post("/agent/import", async (c) =>
    c.json(await importAgentSessions(await deps.actorOf(c), await readBody(c))),
  );
  app.get("/workspace/storage", async (c) =>
    c.json(await workspaceStorageUsage(workspaceOf(await deps.actorOf(c)))),
  );
  app.get("/workspace/agent-sharing", async (c) =>
    c.json(await readAgentSharing(await deps.actorOf(c))),
  );
  app.put("/workspace/agent-sharing", async (c) =>
    c.json(await saveAgentSharing(await deps.actorOf(c), await readBody(c))),
  );
}
