import type { Context } from "hono";
import type { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { uid } from "./crypto";
import { prisma } from "./db";
import { assertAdmin, assertWritable, notify, type Actor } from "./domain";
import { ApiError } from "./errors";
import { publish } from "./events";
import { assertChannelManageRate, assertChannelPostRate } from "./rate-limit";

const MESSAGE_MAX = 2000;
const CHANNEL_CAP = 50;
const MENTION_CAP = 8;

const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function normalizeChannelName(raw: string) {
  const name = raw
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 32);
  if (name.length < 2 || !/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(name)) {
    throw new ApiError(400, "Use um nome com letras ou números, de 2 a 32 caracteres.");
  }
  return name;
}

export function normalizeChannelTopic(raw: string) {
  return raw
    .normalize("NFKC")
    .replace(INVISIBLE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function normalizeChannelMessage(raw: string) {
  const text = raw
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(INVISIBLE, "")
    .trim()
    .replace(/\n{5,}/g, "\n\n\n\n");
  if (!text) throw new ApiError(400, "Escreva uma mensagem.");
  if (text.length > MESSAGE_MAX) {
    throw new ApiError(400, "A mensagem passa de 2000 caracteres.");
  }
  return text;
}

function assertChannelMember(actor: Actor) {
  if (!actor.workspaceId) {
    throw new ApiError(403, "Aceite o convite para entrar num espaço de trabalho.");
  }
  if (actor.access === "cliente") {
    throw new ApiError(403, "Canais são da equipe deste espaço.");
  }
}

function publicChannel(channel: {
  id: string;
  name: string;
  topic: string;
  position: number;
  createdAt: Date;
}) {
  return {
    id: channel.id,
    name: channel.name,
    topic: channel.topic,
    position: channel.position,
    createdAt: channel.createdAt.toISOString(),
  };
}

function publicMessage(message: {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
}) {
  return {
    id: message.id,
    channelId: message.channelId,
    authorId: message.authorId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt ? message.editedAt.toISOString() : null,
  };
}

function uniqueName(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function visibleChannel(actor: Actor, id: string) {
  assertChannelMember(actor);
  if (!id || id.length > 40) throw new ApiError(404, "Canal não encontrado.");
  const channel = await prisma.channel.findFirst({
    where: { id, workspaceId: actor.workspaceId! },
  });
  if (!channel) throw new ApiError(404, "Canal não encontrado.");
  return channel;
}

async function ensureDefaultChannel(actor: Actor) {
  const workspaceId = actor.workspaceId!;
  const count = await prisma.channel.count({ where: { workspaceId } });
  if (count > 0) return;
  try {
    await prisma.channel.create({
      data: {
        id: uid("ch"),
        workspaceId,
        name: "geral",
        topic: "Canal da equipe para o dia a dia",
        position: 0,
        createdById: actor.id,
      },
    });
  } catch (error) {
    if (!uniqueName(error)) throw error;
  }
}

export async function listChannels(actor: Actor) {
  assertChannelMember(actor);
  await ensureDefaultChannel(actor);
  const rows = await prisma.channel.findMany({
    where: { workspaceId: actor.workspaceId! },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(publicChannel);
}

export async function createChannel(actor: Actor, name: string, topic = "") {
  assertAdmin(actor);
  assertChannelMember(actor);
  await assertChannelManageRate(actor.id);
  const workspaceId = actor.workspaceId!;
  const count = await prisma.channel.count({ where: { workspaceId } });
  if (count >= CHANNEL_CAP) throw new ApiError(400, "Este espaço já tem 50 canais.");
  const position =
    ((
      await prisma.channel.aggregate({
        where: { workspaceId },
        _max: { position: true },
      })
    )._max.position ?? -1) + 1;
  try {
    const channel = await prisma.channel.create({
      data: {
        id: uid("ch"),
        workspaceId,
        name: normalizeChannelName(name),
        topic: normalizeChannelTopic(topic),
        position,
        createdById: actor.id,
      },
    });
    const payload = publicChannel(channel);
    publish({ workspaceId, kind: "channel", channel: payload });
    return payload;
  } catch (error) {
    if (uniqueName(error)) throw new ApiError(409, "Já existe um canal com esse nome.");
    throw error;
  }
}

export async function updateChannel(
  actor: Actor,
  id: string,
  patch: { name?: string; topic?: string },
) {
  assertAdmin(actor);
  const current = await visibleChannel(actor, id);
  const data: { name?: string; topic?: string } = {};
  if (patch.name !== undefined) data.name = normalizeChannelName(patch.name);
  if (patch.topic !== undefined) data.topic = normalizeChannelTopic(patch.topic);
  if (Object.keys(data).length === 0) return publicChannel(current);
  try {
    const channel = await prisma.channel.update({ where: { id: current.id }, data });
    const payload = publicChannel(channel);
    publish({ workspaceId: actor.workspaceId!, kind: "channel", channel: payload });
    return payload;
  } catch (error) {
    if (uniqueName(error)) throw new ApiError(409, "Já existe um canal com esse nome.");
    throw error;
  }
}

export async function deleteChannel(actor: Actor, id: string) {
  assertAdmin(actor);
  const current = await visibleChannel(actor, id);
  const count = await prisma.channel.count({ where: { workspaceId: actor.workspaceId! } });
  if (count <= 1) throw new ApiError(400, "O espaço precisa de pelo menos um canal.");
  await prisma.channel.delete({ where: { id: current.id } });
  publish({ workspaceId: actor.workspaceId!, kind: "channel-removed", channelId: current.id });
}

export async function reorderChannels(actor: Actor, ids: string[]) {
  assertAdmin(actor);
  assertChannelMember(actor);
  if (ids.length === 0 || ids.length > CHANNEL_CAP || new Set(ids).size !== ids.length) {
    throw new ApiError(400, "Dados inválidos.");
  }
  const existing = await prisma.channel.findMany({
    where: { workspaceId: actor.workspaceId! },
    select: { id: true },
  });
  if (existing.length !== ids.length || existing.some((row) => !ids.includes(row.id))) {
    throw new ApiError(400, "A lista de canais está desatualizada.");
  }
  await prisma.$transaction(
    ids.map((channelId, position) =>
      prisma.channel.update({ where: { id: channelId }, data: { position } }),
    ),
  );
  const channels = await listChannels(actor);
  publish({ workspaceId: actor.workspaceId!, kind: "channels", channels });
  return channels;
}

export async function listChannelMessages(
  actor: Actor,
  channelId: string,
  query: { limit?: number; before?: string; q?: string },
) {
  const channel = await visibleChannel(actor, channelId);
  const limit = query.limit ?? 50;
  const term = query.q?.trim();
  if (term) {
    const rows = await prisma.channelMessage.findMany({
      where: { channelId: channel.id, body: { contains: term.slice(0, 80), mode: "insensitive" } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(limit, 50),
    });
    return { messages: rows.reverse().map(publicMessage), nextCursor: null as string | null };
  }

  let cursor: { createdAt: Date; id: string } | null = null;
  if (query.before) {
    if (query.before.length > 40) throw new ApiError(400, "Página inválida.");
    cursor = await prisma.channelMessage.findFirst({
      where: { id: query.before, channelId: channel.id },
      select: { createdAt: true, id: true },
    });
    if (!cursor) throw new ApiError(400, "Página inválida.");
  }

  const rows = await prisma.channelMessage.findMany({
    where: {
      channelId: channel.id,
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

async function notifyMentions(
  actor: Actor,
  channel: { id: string; name: string },
  body: string,
) {
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: actor.workspaceId!,
      status: "active",
      access: { not: "cliente" },
      userId: { not: actor.id },
    },
    include: { user: { select: { id: true, name: true } } },
  });
  const ranked = members
    .filter((member) => member.user.name.trim().length >= 2)
    .sort((a, b) => b.user.name.length - a.user.name.length);
  let rest = body;
  const hits: string[] = [];
  for (const member of ranked) {
    if (hits.length >= MENTION_CAP) break;
    const needle = `@${member.user.name}`;
    if (!rest.includes(needle)) continue;
    hits.push(member.userId);
    rest = rest.split(needle).join(" ");
  }
  await Promise.all(
    hits.map((userId) =>
      notify({
        userId,
        workspaceId: actor.workspaceId,
        type: "channel",
        title: `#${channel.name}`,
        body: `${actor.name}: ${body.slice(0, 140)}`,
        href: `/mensagens/${channel.id}`,
      }),
    ),
  );
}

export async function postChannelMessage(actor: Actor, channelId: string, body: string) {
  assertWritable(actor);
  const channel = await visibleChannel(actor, channelId);
  const text = normalizeChannelMessage(body);
  await assertChannelPostRate(actor.id);
  const message = await prisma.channelMessage.create({
    data: { id: uid("cm"), channelId: channel.id, authorId: actor.id, body: text },
  });
  const payload = publicMessage(message);
  publish({ workspaceId: actor.workspaceId!, kind: "channel-message", message: payload });
  await notifyMentions(actor, channel, text);
  return payload;
}

export async function editChannelMessage(
  actor: Actor,
  channelId: string,
  messageId: string,
  body: string,
) {
  assertWritable(actor);
  const channel = await visibleChannel(actor, channelId);
  if (!messageId || messageId.length > 40) throw new ApiError(404, "Mensagem não encontrada.");
  const current = await prisma.channelMessage.findFirst({
    where: { id: messageId, channelId: channel.id },
  });
  if (!current) throw new ApiError(404, "Mensagem não encontrada.");
  if (current.authorId !== actor.id) {
    throw new ApiError(403, "Você só pode editar as suas mensagens.");
  }
  const text = normalizeChannelMessage(body);
  const message = await prisma.channelMessage.update({
    where: { id: current.id },
    data: { body: text, editedAt: new Date() },
  });
  const payload = publicMessage(message);
  publish({ workspaceId: actor.workspaceId!, kind: "channel-message", message: payload });
  return payload;
}

export async function deleteChannelMessage(actor: Actor, channelId: string, messageId: string) {
  assertWritable(actor);
  const channel = await visibleChannel(actor, channelId);
  if (!messageId || messageId.length > 40) throw new ApiError(404, "Mensagem não encontrada.");
  const current = await prisma.channelMessage.findFirst({
    where: { id: messageId, channelId: channel.id },
  });
  if (!current) throw new ApiError(404, "Mensagem não encontrada.");
  if (current.authorId !== actor.id && actor.access !== "admin") {
    throw new ApiError(403, "Você só pode apagar as suas mensagens.");
  }
  await prisma.channelMessage.delete({ where: { id: current.id } });
  publish({
    workspaceId: actor.workspaceId!,
    kind: "channel-message-removed",
    channelId: channel.id,
    messageId: current.id,
  });
}

function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "Dados inválidos.");
  return result.data;
}

const messageBody = z.object({ body: z.string().max(8000) });

function messageQuery(c: Context) {
  const q = c.req.query("q");
  const before = c.req.query("before");
  if ((q && q.length > 80) || (before && before.length > 40)) {
    throw new ApiError(400, "Dados inválidos.");
  }
  const limitRaw = c.req.query("limit");
  let limit: number | undefined;
  if (limitRaw !== undefined) {
    if (!/^\d+$/.test(limitRaw)) throw new ApiError(400, "Dados inválidos.");
    limit = Number(limitRaw);
    if (limit < 1 || limit > 100) throw new ApiError(400, "Dados inválidos.");
  }
  return { limit, before, q };
}

export function registerChannelRoutes(
  app: Hono,
  deps: { actorOf: (c: Context) => Promise<Actor> },
) {
  app.get("/channels", async (c) => c.json(await listChannels(await deps.actorOf(c))));

  app.post("/channels", async (c) => {
    const body = parse(
      z.object({ name: z.string().max(80), topic: z.string().max(200).optional() }),
      await c.req.json(),
    );
    return c.json(await createChannel(await deps.actorOf(c), body.name, body.topic));
  });

  app.post("/channels/reorder", async (c) => {
    const body = parse(
      z.object({ ids: z.array(z.string().max(40)).max(CHANNEL_CAP) }),
      await c.req.json(),
    );
    return c.json(await reorderChannels(await deps.actorOf(c), body.ids));
  });

  app.patch("/channels/:id", async (c) => {
    const body = parse(
      z
        .object({ name: z.string().max(80).optional(), topic: z.string().max(200).optional() })
        .refine((value) => value.name !== undefined || value.topic !== undefined),
      await c.req.json(),
    );
    return c.json(await updateChannel(await deps.actorOf(c), c.req.param("id"), body));
  });

  app.delete("/channels/:id", async (c) => {
    await deleteChannel(await deps.actorOf(c), c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/channels/:id/messages", async (c) =>
    c.json(await listChannelMessages(await deps.actorOf(c), c.req.param("id"), messageQuery(c))),
  );

  app.post("/channels/:id/messages", async (c) => {
    const body = parse(messageBody, await c.req.json());
    return c.json(await postChannelMessage(await deps.actorOf(c), c.req.param("id"), body.body));
  });

  app.patch("/channels/:id/messages/:messageId", async (c) => {
    const body = parse(messageBody, await c.req.json());
    return c.json(
      await editChannelMessage(await deps.actorOf(c), c.req.param("id"), c.req.param("messageId"), body.body),
    );
  });

  app.delete("/channels/:id/messages/:messageId", async (c) => {
    await deleteChannelMessage(await deps.actorOf(c), c.req.param("id"), c.req.param("messageId"));
    return c.json({ ok: true });
  });
}
