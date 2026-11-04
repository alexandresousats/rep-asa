import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import { Hono } from "hono";
import { prisma } from "./db";
import { registerDirectRoutes } from "./direct";
import type { Actor } from "./domain";
import { ApiError } from "./errors";
import { deliversLiveEvent, subscribe, type LiveEvent } from "./events";

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

test("evento direto só chega para os dois participantes", () => {
  const event: LiveEvent = {
    workspaceId: "ws",
    kind: "direct-message",
    audience: ["ana", "bia"],
    message: { body: "segredo" },
  };
  const person = (id: string, access: Actor["access"] = "editor", workspaceId: string | null = "ws") => ({
    id,
    workspaceId,
    access,
  });
  assert.equal(deliversLiveEvent(person("ana"), event), true);
  assert.equal(deliversLiveEvent(person("bia"), event), true);
  assert.equal(deliversLiveEvent(person("admin", "admin"), event), false);
  assert.equal(deliversLiveEvent(person("ana", "cliente"), event), false);
  assert.equal(deliversLiveEvent(person("ana", "editor", "outro"), event), false);
  assert.equal(
    deliversLiveEvent(person("ana"), {
      workspaceId: "ws",
      kind: "channel-message",
      message: { body: "canal" },
    }),
    true,
  );
  assert.equal(
    deliversLiveEvent(person("ana"), {
      workspaceId: null,
      kind: "notification",
      userId: "bia",
    }),
    false,
  );
});

test("mensagem direta fica só entre as duas pessoas", async () => {
  const prefix = `dm${randomBytes(4).toString("hex")}`;
  const ws = `${prefix}-ws`;
  const otherWs = `${prefix}-ws2`;
  const ids = ["admin", "ana", "bia", "caio", "leo", "leitura", "cliente", "fora"].map(
    (name) => `${prefix}-${name}`,
  );
  const [admin, ana, bia, caio, leo, leitura, cliente, fora] = ids;
  created.userIds.push(...ids);
  created.workspaceIds.push(ws, otherWs);

  for (const userId of ids) {
    const name =
      userId === ana ? "Ana Lima" : userId === bia ? "Bia Souza" : userId === admin ? "Dono" : userId;
    await prisma.user.create({
      data: {
        id: userId,
        firstName: name,
        lastName: "",
        name,
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
          { userId: ana, access: "editor", status: "active", role: "Criação" },
          { userId: bia, access: "editor", status: "active", role: "Criação" },
          { userId: caio, access: "editor", status: "active", role: "Criação" },
          { userId: leo, access: "editor", status: "active", role: "Criação" },
          { userId: leitura, access: "leitura", status: "active", role: "Leitura" },
          { userId: cliente, access: "cliente", status: "active", role: "Cliente" },
        ],
      },
    },
  });
  await prisma.workspace.create({
    data: {
      id: otherWs,
      name: "Outro",
      members: {
        create: { userId: fora, access: "admin", status: "active", role: "Direção", owner: true },
      },
    },
  });
  await prisma.project.create({
    data: {
      id: `${prefix}-proj`,
      name: "Campanha",
      color: "#111111",
      description: "",
      ownerId: admin,
      workspaceId: ws,
      createdAt: new Date().toISOString(),
      members: {
        create: [admin, ana, bia, caio, leitura, cliente].map((userId) => ({ userId })),
      },
    },
  });

  const actors = {
    admin: actorFor(admin, ws, "admin", "Dono"),
    ana: actorFor(ana, ws, "editor", "Ana Lima"),
    bia: actorFor(bia, ws, "editor", "Bia Souza"),
    caio: actorFor(caio, ws, "editor", "Caio"),
    leo: actorFor(leo, ws, "editor", "Leo"),
    leitura: actorFor(leitura, ws, "leitura", "Leitor"),
    cliente: actorFor(cliente, ws, "cliente", "Cliente"),
    fora: actorFor(fora, otherWs, "admin", "Fora"),
  };

  let current = actors.ana;
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json({ error: error.message }, error.status as 400);
    console.error(error);
    return c.json({ error: "Erro interno." }, 500);
  });
  registerDirectRoutes(app, { actorOf: async () => current });

  async function call(who: Actor, method: string, url: string, body?: unknown) {
    current = who;
    const res = await app.request(url, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return {
      status: res.status,
      json: text ? (JSON.parse(text) as unknown) : null,
      cache: res.headers.get("cache-control"),
    };
  }

  assert.equal((await call(actors.cliente, "GET", "/direct")).status, 403);
  assert.equal(await prisma.directConversation.count({ where: { workspaceId: ws } }), 0);

  const peers = (await call(actors.ana, "GET", "/direct/peers")).json as Array<Record<string, unknown>>;
  const peerIds = peers.map((peer) => peer.id);
  assert.deepEqual(peerIds.filter((id) => id === leo || id === cliente || id === ana), []);
  assert.ok(peerIds.includes(bia));
  assert.ok(peerIds.includes(admin));
  assert.equal(JSON.stringify(peers).includes("@"), false);
  assert.equal("email" in peers[0]! || "phone" in peers[0]!, false);

  const adminPeers = (await call(actors.admin, "GET", "/direct/peers")).json as Array<Record<string, unknown>>;
  assert.ok(adminPeers.some((peer) => peer.id === leo));
  assert.equal(adminPeers.some((peer) => peer.id === cliente), false);

  assert.equal((await call(actors.ana, "POST", "/direct/messages", { userId: ana, body: "oi" })).status, 400);
  assert.equal((await call(actors.ana, "POST", "/direct/messages", { userId: leo, body: "oi" })).status, 404);
  assert.equal((await call(actors.ana, "POST", "/direct/messages", { userIds: [bia], body: "oi" })).status, 400);
  assert.equal(
    (await call(actors.ana, "POST", "/direct/messages", { userId: bia, body: "a".repeat(2001) })).status,
    400,
  );
  assert.equal(await prisma.directConversation.count({ where: { workspaceId: ws } }), 0);

  const seen: LiveEvent[] = [];
  const stop = subscribe((event) => seen.push(event));
  let sent: Awaited<ReturnType<typeof call>>;
  try {
    sent = await call(actors.ana, "POST", "/direct/messages", {
      userId: bia,
      body: "  senha-secreta-xyz\u0000  ",
    });
  } finally {
    stop();
  }
  assert.equal(sent!.status, 200);
  assert.equal(sent!.cache, "private, no-store");
  const payload = sent!.json as {
    conversation: { id: string; peer: { id: string; role: string; email?: string } };
    message: { id: string; body: string; conversationId: string };
  };
  assert.equal(payload.message.body, "senha-secreta-xyz");
  assert.equal(payload.conversation.peer.id, bia);
  assert.equal(payload.conversation.peer.role, "Criação");
  assert.equal(JSON.stringify(payload).includes("@"), false);
  assert.equal("email" in payload.conversation.peer, false);

  const directs = seen.filter((event) => event.kind === "direct");
  assert.equal(directs.length, 2);
  assert.deepEqual(
    directs.map((event) => (event.kind === "direct" ? event.audience[0] : "")).sort(),
    [ana, bia].sort(),
  );
  const messageEvent = seen.find((event) => event.kind === "direct-message");
  assert.ok(messageEvent);
  assert.equal(deliversLiveEvent(actors.bia, messageEvent), true);
  assert.equal(deliversLiveEvent(actors.ana, messageEvent), true);
  assert.equal(deliversLiveEvent(actors.caio, messageEvent), false);
  assert.equal(deliversLiveEvent(actors.admin, messageEvent), false);
  assert.equal(deliversLiveEvent(actors.cliente, messageEvent), false);
  assert.equal(deliversLiveEvent(actors.fora, messageEvent), false);

  const again = await call(actors.bia, "POST", "/direct/messages", { userId: ana, body: "resposta" });
  assert.equal(again.status, 200);
  const reply = again.json as { conversation: { id: string } };
  assert.equal(reply.conversation.id, payload.conversation.id);

  const secret = "senha-secreta-xyz";
  const anaList = await call(actors.ana, "GET", "/direct");
  assert.equal(JSON.stringify(anaList.json).includes(payload.conversation.id), true);
  const anaMessages = await call(actors.ana, "GET", `/direct/${payload.conversation.id}/messages`);
  assert.equal(JSON.stringify(anaMessages.json).includes(secret), true);
  const caioList = await call(actors.caio, "GET", "/direct");
  assert.equal(JSON.stringify(caioList.json).includes(secret), false);
  assert.equal(JSON.stringify(caioList.json).includes(payload.conversation.id), false);
  const adminList = await call(actors.admin, "GET", "/direct");
  assert.equal(JSON.stringify(adminList.json).includes(secret), false);

  assert.equal((await call(actors.admin, "GET", `/direct/${payload.conversation.id}`)).status, 404);
  assert.equal((await call(actors.caio, "GET", `/direct/${payload.conversation.id}/messages`)).status, 404);
  assert.equal((await call(actors.fora, "GET", `/direct/${payload.conversation.id}`)).status, 404);
  assert.equal((await call(actors.ana, "GET", "/direct/nao-existe")).status, 404);
  assert.equal((await call(actors.admin, "GET", "/direct/!!!")).cache, "private, no-store");

  const read = await call(actors.bia, "GET", `/direct/${payload.conversation.id}/messages`);
  assert.equal(read.status, 200);
  assert.equal(JSON.stringify(read.json).includes(secret), true);

  assert.equal(
    (await call(actors.bia, "PATCH", `/direct/${payload.conversation.id}/messages/${payload.message.id}`, { body: "invadi" })).status,
    403,
  );
  assert.equal(
    (await call(actors.admin, "DELETE", `/direct/${payload.conversation.id}/messages/${payload.message.id}`)).status,
    404,
  );

  const toCaio = await call(actors.ana, "POST", "/direct/messages", { userId: caio, body: "oi caio" });
  assert.equal(toCaio.status, 200);
  const other = toCaio.json as { conversation: { id: string } };
  assert.notEqual(other.conversation.id, payload.conversation.id);
  assert.equal(
    (
      await call(actors.ana, "PATCH", `/direct/${other.conversation.id}/messages/${payload.message.id}`, {
        body: "troca",
      })
    ).status,
    404,
  );

  const toReader = await call(actors.ana, "POST", "/direct/messages", { userId: leitura, body: "para leitura" });
  assert.equal(toReader.status, 200);
  const readerConversation = (toReader.json as { conversation: { id: string } }).conversation.id;
  assert.equal((await call(actors.leitura, "GET", `/direct/${readerConversation}/messages`)).status, 200);
  assert.equal(
    (await call(actors.leitura, "POST", "/direct/messages", { userId: ana, body: "não posso" })).status,
    403,
  );

  const adminToLeo = await call(actors.admin, "POST", "/direct/messages", { userId: leo, body: "oi leo" });
  assert.equal(adminToLeo.status, 200);
  const leoConversation = (adminToLeo.json as { conversation: { id: string } }).conversation.id;
  assert.equal((await call(actors.ana, "GET", `/direct/${leoConversation}`)).status, 404);
  assert.equal(JSON.stringify((await call(actors.ana, "GET", "/direct")).json).includes("oi leo"), false);

  const notes = await prisma.notification.findMany({ where: { type: "direct", workspaceId: ws } });
  assert.equal(notes.length, 5);
  assert.ok(notes.every((note) => note.body === "Mensagem privada" && !note.body.includes(secret)));
  assert.deepEqual(notes.map((note) => note.userId).sort(), [ana, bia, caio, leitura, leo].sort());
  assert.equal(notes.some((note) => note.href === `/mensagens/d/${payload.conversation.id}`), true);

  const edited = await call(actors.ana, "PATCH", `/direct/${payload.conversation.id}/messages/${payload.message.id}`, {
    body: "texto novo",
  });
  assert.equal(edited.status, 200);
  assert.equal((edited.json as { body: string }).body, "texto novo");
  const removed = await call(actors.ana, "DELETE", `/direct/${payload.conversation.id}/messages/${payload.message.id}`);
  assert.equal(removed.status, 200);
  const left = await call(actors.bia, "GET", `/direct/${payload.conversation.id}/messages`);
  assert.equal(JSON.stringify(left.json).includes(secret), false);
  assert.equal(JSON.stringify(left.json).includes("resposta"), true);
});
