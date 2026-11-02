import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import { Hono } from "hono";
import { normalizeChannelMessage, normalizeChannelName, registerChannelRoutes } from "./channels";
import { prisma } from "./db";
import type { Actor } from "./domain";
import { ApiError } from "./errors";

const created = { userIds: [] as string[], workspaceIds: [] as string[] };

after(async () => {
  await prisma.workspace.deleteMany({ where: { id: { in: created.workspaceIds } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => undefined);
  await prisma.$disconnect();
});

function actorFor(id: string, workspaceId: string, access: Actor["access"], name = id): Actor {
  return {
    id,
    workspaceId,
    access,
    owner: access === "admin",
    firstName: name,
    lastName: "",
    name,
    email: `${id}@example.com`,
    phone: null,
    emailVerified: true,
    hasPassword: false,
    initials: "XX",
    role: access === "cliente" ? "Cliente" : "Time",
    avatar: null,
    master: false,
    membershipStatus: "active",
    workspaceName: "Espaço",
  };
}

test("nome e texto de canal descartam caracteres de controle", () => {
  assert.equal(normalizeChannelName("  Sala da Equipe!! "), "sala-da-equipe");
  assert.equal(normalizeChannelMessage("  oi\u0000\n\nmundo  "), "oi\n\nmundo");
  assert.throws(() => normalizeChannelName("???"), (error: unknown) => error instanceof ApiError);
  assert.throws(() => normalizeChannelMessage("   "), (error: unknown) => error instanceof ApiError);
  assert.throws(
    () => normalizeChannelMessage("a".repeat(2001)),
    (error: unknown) => error instanceof ApiError && error.status === 400,
  );
});

test("canais: só a equipe do espaço lê, escreve e administra", async () => {
  const prefix = `ch${randomBytes(4).toString("hex")}`;
  const ws = `${prefix}-ws`;
  const otherWs = `${prefix}-ws2`;
  const quietWs = `${prefix}-quiet`;
  const [admin, editor, reader, client, outsider, quietClient] = [
    "admin",
    "editor",
    "reader",
    "client",
    "outsider",
    "quiet",
  ].map((name) => `${prefix}-${name}`);
  created.userIds.push(admin, editor, reader, client, outsider, quietClient);
  created.workspaceIds.push(ws, otherWs, quietWs);

  for (const userId of [admin, editor, reader, client, outsider, quietClient]) {
    const named =
      userId === editor
        ? { firstName: "Ana", lastName: "Lima", name: "Ana Lima" }
        : userId === admin
          ? { firstName: "Bruno", lastName: "Alves", name: "Bruno Alves" }
          : { firstName: userId, lastName: "", name: userId };
    await prisma.user.create({
      data: {
        id: userId,
        ...named,
        email: `${userId}@example.com`,
        initials: "XX",
        role: "Time",
        access: "editor",
      },
    });
  }
  await prisma.workspace.create({
    data: {
      id: ws,
      name: "Espaço",
      members: {
        create: [
          { userId: admin, access: "admin", status: "active", role: "Direção", owner: true },
          { userId: editor, access: "editor", status: "active", role: "Time" },
          { userId: reader, access: "leitura", status: "active", role: "Leitura" },
          { userId: client, access: "cliente", status: "active", role: "Cliente" },
        ],
      },
    },
  });
  await prisma.workspace.create({
    data: {
      id: otherWs,
      name: "Outro",
      members: {
        create: { userId: outsider, access: "admin", status: "active", role: "Direção", owner: true },
      },
    },
  });
  await prisma.workspace.create({
    data: {
      id: quietWs,
      name: "Quieto",
      members: {
        create: { userId: quietClient, access: "cliente", status: "active", role: "Cliente", owner: true },
      },
    },
  });

  const actors = {
    admin: actorFor(admin, ws, "admin", "Admin"),
    editor: actorFor(editor, ws, "editor", "Ana Lima"),
    reader: actorFor(reader, ws, "leitura", "Leitor"),
    client: actorFor(client, ws, "cliente", "Cliente"),
    outsider: actorFor(outsider, otherWs, "admin", "Outro"),
    quietClient: actorFor(quietClient, quietWs, "cliente", "Quieto"),
  };

  let current = actors.admin;
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json({ error: error.message }, error.status as 400);
    console.error(error);
    return c.json({ error: "Erro interno." }, 500);
  });
  registerChannelRoutes(app, { actorOf: async () => current });

  async function call(who: Actor, method: string, url: string, body?: unknown) {
    current = who;
    const res = await app.request(url, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : null };
  }

  assert.equal((await call(actors.quietClient, "GET", "/channels")).status, 403);
  assert.equal(await prisma.channel.count({ where: { workspaceId: quietWs } }), 0);

  assert.equal((await call(actors.client, "GET", "/channels")).status, 403);

  const listed = await call(actors.editor, "GET", "/channels");
  assert.equal(listed.status, 200);
  const channels = listed.json as unknown as { id: string; name: string }[];
  assert.equal(channels.length, 1);
  assert.equal(channels[0]?.name, "geral");
  const geralId = channels[0]!.id;

  assert.equal((await call(actors.editor, "POST", "/channels", { name: "privado" })).status, 403);
  assert.equal((await call(actors.reader, "POST", `/channels/${geralId}/messages`, { body: "oi" })).status, 403);

  const createdChannel = await call(actors.admin, "POST", "/channels", {
    name: "Sala da Equipe",
    topic: "Decisões do dia",
  });
  assert.equal(createdChannel.status, 200);
  const room = createdChannel.json as { id: string; name: string; topic: string };
  assert.equal(room.name, "sala-da-equipe");
  assert.equal(room.topic, "Decisões do dia");
  assert.equal((await call(actors.admin, "POST", "/channels", { name: "sala da equipe" })).status, 409);

  const secret = await call(actors.editor, "POST", `/channels/${room.id}/messages`, {
    body: "  segredo <script>alert(1)</script> @Ana Lima @Bruno Alves\u0000  ",
  });
  assert.equal(secret.status, 200);
  const message = secret.json as { id: string; body: string; authorId: string };
  assert.equal(message.body, "segredo <script>alert(1)</script> @Ana Lima @Bruno Alves");
  assert.equal(message.authorId, editor);

  const mention = await prisma.notification.findFirst({
    where: { userId: editor, href: `/mensagens/${room.id}` },
  });
  assert.equal(mention, null);

  const adminNote = await prisma.notification.findFirst({
    where: { userId: admin, type: "channel", href: `/mensagens/${room.id}` },
  });
  assert.ok(adminNote);
  assert.equal(
    await prisma.notification.count({ where: { userId: client, type: "channel" } }),
    0,
  );

  assert.equal((await call(actors.outsider, "GET", `/channels/${room.id}/messages`)).status, 404);
  assert.equal(
    (await call(actors.client, "GET", `/channels/${room.id}/messages`)).status,
    403,
  );

  const readerView = await call(actors.reader, "GET", `/channels/${room.id}/messages`);
  assert.equal(readerView.status, 200);
  const readerPage = readerView.json as { messages: { body: string }[] };
  assert.equal(readerPage.messages.length, 1);
  assert.equal(readerPage.messages[0]?.body, message.body);

  const otherSearch = await call(actors.outsider, "GET", "/channels");
  const otherId = (otherSearch.json as { id: string }[])[0]?.id;
  const leaked = await call(actors.outsider, "GET", `/channels/${otherId}/messages?q=segredo`);
  assert.equal(leaked.status, 200);
  assert.equal((leaked.json as { messages: unknown[] }).messages.length, 0);

  assert.equal(
    (await call(actors.admin, "PATCH", `/channels/${room.id}/messages/${message.id}`, { body: "alterado" }))
      .status,
    403,
  );
  const edited = await call(actors.editor, "PATCH", `/channels/${room.id}/messages/${message.id}`, {
    body: "segredo revisado",
  });
  assert.equal(edited.status, 200);
  assert.equal((edited.json as { editedAt: string | null }).editedAt === null, false);

  assert.equal(
    (await call(actors.editor, "DELETE", `/channels/${geralId}/messages/${message.id}`)).status,
    404,
  );
  assert.equal(
    (await call(actors.reader, "DELETE", `/channels/${room.id}/messages/${message.id}`)).status,
    403,
  );
  assert.equal(
    (await call(actors.admin, "DELETE", `/channels/${room.id}/messages/${message.id}`)).status,
    200,
  );

  assert.equal((await call(actors.admin, "DELETE", `/channels/${geralId}`)).status, 200);
  assert.equal((await call(actors.admin, "DELETE", `/channels/${room.id}`)).status, 400);
});
