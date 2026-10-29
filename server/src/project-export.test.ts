import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import { Hono } from "hono";
import { parseCsv } from "./csv";
import { prisma } from "./db";
import type { Actor } from "./domain";
import { ApiError } from "./errors";
import { neutralizeFormula, registerProjectExportRoutes } from "./project-export";

const created = { userIds: [] as string[], workspaceId: "" };

after(async () => {
  if (created.workspaceId) {
    await prisma.workspace.delete({ where: { id: created.workspaceId } }).catch(() => undefined);
  }
  if (created.userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

test("fórmulas viram texto no CSV", () => {
  assert.equal(neutralizeFormula("=SOMA(A1)"), "'=SOMA(A1)");
  assert.equal(neutralizeFormula("+55 11"), "'+55 11");
  assert.equal(neutralizeFormula("-1"), "'-1");
  assert.equal(neutralizeFormula("@user"), "'@user");
  assert.equal(neutralizeFormula("\tx"), "'\tx");
  assert.equal(neutralizeFormula("\rx"), "'\rx");
  assert.equal(neutralizeFormula("Post 1"), "Post 1");
});

test("exportar CSV do projeto: colunas, escape, filtro e permissões", async () => {
  const prefix = `pex${randomBytes(4).toString("hex")}`;
  const userId = `${prefix}-user`;
  const outsiderId = `${prefix}-outsider`;
  const workspaceId = `${prefix}-ws`;
  const projectId = `${prefix}-proj`;
  const parentId = `${prefix}-parent`;
  const childId = `${prefix}-child`;
  const trickyId = `${prefix}-tricky`;
  created.userIds.push(userId, outsiderId);
  created.workspaceId = workspaceId;

  for (const [id, name] of [
    [userId, "Ana Teste"],
    [outsiderId, "Bia Fora"],
  ]) {
    await prisma.user.create({
      data: {
        id,
        firstName: name.split(" ")[0],
        lastName: "Teste",
        name,
        email: `${id}@example.com`,
        initials: "AT",
        role: "Direção",
        access: "admin",
      },
    });
  }
  await prisma.workspace.create({
    data: {
      id: workspaceId,
      name: "Espaço",
      members: {
        create: [
          { userId, access: "admin", status: "active", role: "Direção", owner: true },
          { userId: outsiderId, access: "editor", status: "active", role: "Time" },
        ],
      },
      projects: {
        create: {
          id: projectId,
          name: "Campanha Ação",
          color: "#0284c7",
          description: "",
          ownerId: userId,
          createdAt: "2026-10-01",
          members: { create: { userId } },
          sections: {
            create: [
              { id: `${prefix}-s1`, name: "Roteiro", position: 0 },
              { id: `${prefix}-s2`, name: "Gravação", position: 1 },
            ],
          },
        },
      },
    },
  });
  const tagA = `${prefix}-tag-a`;
  const tagB = `${prefix}-tag-b`;
  await prisma.tag.createMany({
    data: [
      { id: tagA, name: "Reels", color: "#ec4899", workspaceId },
      { id: tagB, name: "Feed", color: "#000000", workspaceId },
    ],
  });
  await prisma.task.create({
    data: {
      id: parentId,
      projectId,
      title: "Vídeo de lançamento",
      section: "Gravação",
      assigneeId: userId,
      startDate: "2026-10-10",
      dueDate: "2026-10-15",
      priority: "alta",
      status: "done",
      completedAt: "2026-10-14T10:00:00",
      approvalStatus: "changes_requested",
      createdAt: "2026-10-01",
      tags: { create: [{ tagId: tagA }, { tagId: tagB }] },
    },
  });
  await prisma.task.create({
    data: {
      id: childId,
      projectId,
      parentId,
      title: "Cortar trecho",
      section: "Gravação",
      createdAt: "2026-10-02",
    },
  });
  await prisma.task.create({
    data: {
      id: trickyId,
      projectId,
      title: '=HYPERLINK("x"), "aspas"\nlinha 2',
      section: "Roteiro",
      createdAt: "2026-10-03",
    },
  });

  const actor: Actor = {
    id: userId,
    workspaceId,
    access: "admin",
    owner: true,
    firstName: "Ana",
    lastName: "Teste",
    name: "Ana Teste",
    email: `${userId}@example.com`,
    phone: null,
    emailVerified: true,
    hasPassword: false,
    initials: "AT",
    role: "Direção",
    avatar: null,
    master: false,
    membershipStatus: "active",
    workspaceName: "Espaço",
  };
  let current = actor;
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json({ error: error.message }, error.status as 400);
    console.error(error);
    return c.json({ error: "Erro interno." }, 500);
  });
  registerProjectExportRoutes(app, { actorOf: async () => current });
  const call = (id: string, body: unknown = {}) =>
    app.request(`/projects/${id}/export.csv`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const all = await call(projectId);
  assert.equal(all.status, 200);
  assert.match(all.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(all.headers.get("content-disposition") ?? "", /Campanha-Acao-tarefas-\d{4}-\d{2}-\d{2}\.csv/);
  const bytes = new Uint8Array(await all.clone().arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = await all.text();
  const rows = parseCsv(text);
  assert.deepEqual(rows[0], [
    "Título",
    "Seção",
    "Status",
    "Responsável",
    "Data de início",
    "Data de entrega",
    "Prioridade",
    "Tags",
    "Aprovação",
    "Tipo",
    "Tarefa pai",
    "Concluída em",
    "Criada em",
    "Link",
  ]);
  assert.equal(rows.length, 4);
  // Seções na ordem do projeto: Roteiro antes de Gravação.
  assert.equal(rows[1][0], `'=HYPERLINK("x"), "aspas"\nlinha 2`);
  const parent = rows.find((row) => row[0] === "Vídeo de lançamento")!;
  assert.deepEqual(parent.slice(0, 13), [
    "Vídeo de lançamento",
    "Gravação",
    "Concluída",
    "Ana Teste",
    "2026-10-10",
    "2026-10-15",
    "Alta",
    "Feed; Reels",
    "Ajuste solicitado",
    "Tarefa",
    "",
    "2026-10-14",
    "2026-10-01",
  ]);
  assert.match(parent[13], new RegExp(`/projetos/${projectId}\\?task=${parentId}$`));
  const child = rows.find((row) => row[0] === "Cortar trecho")!;
  assert.equal(child[9], "Subtarefa");
  assert.equal(child[10], "Vídeo de lançamento");

  const filtered = parseCsv(await (await call(projectId, { taskIds: [childId, "outra-tarefa"] })).text());
  assert.equal(filtered.length, 2);
  assert.equal(filtered[1][0], "Cortar trecho");

  assert.equal((await call(`${prefix}-nao-existe`)).status, 404);
  assert.equal((await call(projectId, { taskIds: "x" })).status, 400);

  current = { ...actor, id: outsiderId, access: "editor", owner: false };
  assert.equal((await call(projectId)).status, 403);

  current = { ...actor, access: "cliente", owner: false };
  assert.equal((await call(projectId)).status, 403);

  current = { ...actor, workspaceId: `${prefix}-outro` };
  assert.equal((await call(projectId)).status, 404);
});
