import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import { Hono } from "hono";
import { registerAgentSessionRoutes } from "./agent-sessions";
import { prisma } from "./db";
import type { Actor } from "./domain";
import { ApiError } from "./errors";

const created = { userIds: [] as string[], workspaceIds: [] as string[] };

after(async () => {
  await prisma.workspace.deleteMany({ where: { id: { in: created.workspaceIds } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => undefined);
  await prisma.$disconnect();
});

function actorFor(id: string, workspaceId: string, access: Actor["access"]): Actor {
  return {
    id,
    workspaceId,
    access,
    owner: access === "admin",
    firstName: id,
    lastName: "",
    name: id,
    email: `${id}@example.com`,
    phone: null,
    emailVerified: true,
    hasPassword: false,
    initials: "XX",
    role: "Time",
    avatar: null,
    master: false,
    membershipStatus: "active",
    workspaceName: "Espaço",
  };
}

const msg = (id: string, content: string, extra: Record<string, unknown> = {}) => ({
  id,
  role: "user",
  content,
  steps: [],
  createdAt: "2026-10-30T10:00:00.000Z",
  ...extra,
});

test("conversas do Agente IA: privadas por padrão, compartilhadas só com permissão do admin", async () => {
  const prefix = `ags${randomBytes(4).toString("hex")}`;
  const ws = `${prefix}-ws`;
  const otherWs = `${prefix}-ws2`;
  const [admin, editor, guest, client, outsider] = ["admin", "editor", "guest", "client", "outsider"].map(
    (name) => `${prefix}-${name}`,
  );
  created.userIds.push(admin, editor, guest, client, outsider);
  created.workspaceIds.push(ws, otherWs);
  for (const userId of [admin, editor, guest, client, outsider]) {
    await prisma.user.create({
      data: { id: userId, firstName: userId, name: userId, email: `${userId}@example.com`, initials: "XX", role: "Time", access: "editor" },
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
          { userId: guest, access: "editor", status: "active", role: "Convidado" },
          { userId: client, access: "cliente", status: "active", role: "Cliente" },
        ],
      },
    },
  });
  await prisma.workspace.create({
    data: {
      id: otherWs,
      name: "Outro",
      members: { create: { userId: outsider, access: "admin", status: "active", role: "Direção", owner: true } },
    },
  });

  const actors = {
    admin: actorFor(admin, ws, "admin"),
    editor: actorFor(editor, ws, "editor"),
    guest: actorFor(guest, ws, "editor"),
    client: actorFor(client, ws, "cliente"),
    outsider: actorFor(outsider, otherWs, "admin"),
  };
  let current = actors.admin;
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json({ error: error.message }, error.status as 400);
    console.error(error);
    return c.json({ error: "Erro interno." }, 500);
  });
  registerAgentSessionRoutes(app, { actorOf: async () => current });
  async function call(who: Actor, method: string, url: string, body?: unknown) {
    current = who;
    const res = await app.request(url, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, text };
  }

  const sessionId = `sess-${prefix}-a`;
  const path = `/agent/sessions/${sessionId}`;
  // A editora cria a conversa dela.
  assert.equal(
    (await call(actors.editor, "POST", `${path}/messages`, {
      title: "Plano de campanha",
      messages: [msg("u1", "segredo da editora"), msg("a1", "", { role: "assistant", pending: true })],
    })).status,
    200,
  );
  const row = await prisma.agentSession.findUniqueOrThrow({ where: { id: sessionId } });
  assert.equal(row.workspaceId, ws);
  assert.equal(row.userId, editor);
  assert.equal(row.title, "Plano de campanha");

  // Sem permissão do admin, ninguém mais vê nem escreve: nem o próprio admin.
  for (const who of [actors.admin, actors.guest, actors.client]) {
    const list = await call(who, "GET", "/agent/sessions");
    assert.deepEqual(list.json.team, []);
    assert.equal(list.json.sharing.enabled, false);
    assert.equal(list.text.includes("segredo"), false);
    assert.equal((await call(who, "GET", path)).status, 404);
    assert.equal((await call(who, "POST", `${path}/messages`, { messages: [msg("x1", "oi")] })).status, 404);
  }
  // Outro espaço não enxerga nem cria por cima do mesmo id.
  assert.equal((await call(actors.outsider, "GET", path)).status, 404);
  assert.equal(
    (await call(actors.outsider, "POST", `${path}/messages`, { messages: [msg("x2", "oi")] })).status,
    404,
  );
  assert.equal(await prisma.agentMessage.count({ where: { sessionId } }), 2);

  // Só o admin liga o compartilhamento.
  assert.equal((await call(actors.editor, "PUT", "/workspace/agent-sharing", { enabled: true })).status, 403);
  const sharing = await call(actors.admin, "PUT", "/workspace/agent-sharing", { enabled: true });
  assert.equal(sharing.status, 200);
  const shared = Object.fromEntries(
    (sharing.json.members as { userId: string; shared: boolean }[]).map((item) => [item.userId, item.shared]),
  );
  assert.deepEqual(shared, { [admin]: true, [editor]: true, [guest]: true, [client]: false });

  // Com o compartilhamento ligado, a equipe vê, lê e continua a conversa.
  const teamList = await call(actors.guest, "GET", "/agent/sessions");
  assert.deepEqual(
    (teamList.json.team as { id: string; ownerName: string }[]).map((item) => [item.id, item.ownerName]),
    [[sessionId, editor]],
  );
  const read = await call(actors.guest, "GET", path);
  assert.equal(read.status, 200);
  assert.equal(read.json.owner, false);
  assert.equal(read.json.messages[0].authorId, editor);
  assert.equal(
    (await call(actors.guest, "POST", `${path}/messages`, {
      messages: [msg("u2", "pergunta do convidado"), msg("a2", "", { role: "assistant", pending: true })],
    })).status,
    200,
  );
  // Termina a própria resposta, mas não reescreve nem apaga nada dos outros.
  assert.equal(
    (await call(actors.guest, "POST", `${path}/messages`, {
      messages: [msg("a2", "resposta pronta", { role: "assistant", pending: false })],
    })).status,
    200,
  );
  assert.equal(
    (await call(actors.guest, "POST", `${path}/messages`, { messages: [msg("u1", "trocado")] })).status,
    403,
  );
  assert.equal((await call(actors.guest, "PUT", `${path}/messages`, { messages: [] })).status, 403);
  assert.equal((await call(actors.guest, "DELETE", `${path}/messages/u1`)).status, 403);
  assert.equal((await call(actors.guest, "PATCH", path, { title: "Meu" })).status, 403);
  assert.equal((await call(actors.guest, "PATCH", path, { deletedAt: new Date().toISOString() })).status, 403);
  assert.equal((await call(actors.guest, "DELETE", path)).status, 403);
  const messages = await prisma.agentMessage.findMany({ where: { sessionId }, orderBy: { seq: "asc" } });
  assert.deepEqual(
    messages.map((item) => [item.id, item.authorId]),
    [["u1", editor], ["a1", editor], ["u2", guest], ["a2", guest]],
  );
  assert.equal((messages[0].data as { content: string }).content, "segredo da editora");

  // Cliente fica de fora até o admin incluir pelo nome.
  assert.deepEqual((await call(actors.client, "GET", "/agent/sessions")).json.team, []);
  assert.equal((await call(actors.client, "GET", path)).status, 404);

  // Desativar alguém da equipe vale nos dois sentidos.
  await call(actors.admin, "PUT", "/workspace/agent-sharing", { members: [{ userId: guest, shared: false }] });
  assert.equal((await call(actors.guest, "GET", path)).status, 404);
  assert.deepEqual((await call(actors.guest, "GET", "/agent/sessions")).json.team, []);
  const guestSession = `sess-${prefix}-g`;
  await call(actors.guest, "POST", `/agent/sessions/${guestSession}/messages`, { messages: [msg("g1", "do convidado")] });
  assert.equal((await call(actors.editor, "GET", `/agent/sessions/${guestSession}`)).status, 404);
  assert.equal(
    (await call(actors.editor, "GET", "/agent/sessions")).json.team.some((item: { id: string }) => item.id === guestSession),
    false,
  );

  // Na lixeira, some para a equipe; só o dono restaura ou apaga.
  await call(actors.editor, "PATCH", path, { deletedAt: new Date().toISOString() });
  assert.equal((await call(actors.admin, "GET", path)).status, 404);
  await call(actors.editor, "PATCH", path, { deletedAt: null });

  // Armazenamento conta no espaço, e o limite vale para todos que gravam nele.
  const usage = await call(actors.guest, "GET", "/workspace/storage");
  assert.equal(usage.status, 200);
  assert.ok(usage.json.agent > 0);
  assert.equal(usage.json.limit, 5 * 1024 * 1024 * 1024);
  const previous = process.env.WORKSPACE_STORAGE_LIMIT_BYTES;
  process.env.WORKSPACE_STORAGE_LIMIT_BYTES = String(usage.json.total + 500);
  try {
    const big = await call(actors.admin, "POST", `/agent/sessions/sess-${prefix}-big/messages`, {
      messages: [msg("b1", "x".repeat(2000))],
    });
    assert.equal(big.status, 413);
    assert.match(big.json.error, /limite/);
    assert.equal(await prisma.agentSession.count({ where: { id: `sess-${prefix}-big` } }), 1);
    assert.equal(await prisma.agentMessage.count({ where: { sessionId: `sess-${prefix}-big` } }), 0);
    // O outro espaço tem a própria cota e não é afetado.
    assert.equal(
      (await call(actors.outsider, "POST", `/agent/sessions/sess-${prefix}-out/messages`, {
        messages: [msg("o1", "pequena")],
      })).status,
      200,
    );
  } finally {
    if (previous === undefined) delete process.env.WORKSPACE_STORAGE_LIMIT_BYTES;
    else process.env.WORKSPACE_STORAGE_LIMIT_BYTES = previous;
  }

  // Migração do navegador: entra na conta de quem está logado; id em uso vira outro.
  const imported = await call(actors.admin, "POST", "/agent/import", {
    folders: [{ id: `fld-${prefix}`, name: "Clientes" }],
    sessions: [
      { id: sessionId, title: "Conversa antiga", folderId: `fld-${prefix}`, messages: [msg("m1", "antiga")] },
      { id: `sess-${prefix}-vazia`, title: "Vazia", messages: [] },
    ],
  });
  assert.equal(imported.status, 200);
  assert.equal(imported.json.imported, 1);
  const adminList = await call(actors.admin, "GET", "/agent/sessions");
  const mine = adminList.json.sessions as { id: string; title: string; folderId: string | null }[];
  const moved = mine.find((item) => item.title === "Conversa antiga");
  assert.ok(moved);
  assert.notEqual(moved.id, sessionId);
  assert.equal(moved.folderId, `fld-${prefix}`);
  assert.equal((await prisma.agentSession.findUniqueOrThrow({ where: { id: sessionId } })).userId, editor);
});
