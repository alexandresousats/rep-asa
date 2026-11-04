import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import { prisma } from "./db";
import { addSubtask, createTask, updateTask, type Actor } from "./domain";

const created = { userId: "", workspaceId: "" };

after(async () => {
  if (created.workspaceId) {
    await prisma.workspace.delete({ where: { id: created.workspaceId } }).catch(() => undefined);
  }
  if (created.userId) {
    await prisma.user.delete({ where: { id: created.userId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

test("tarefa nova guarda quem adicionou, inclusive na subtarefa", async () => {
  const prefix = `tcr${randomBytes(4).toString("hex")}`;
  const userId = `${prefix}-user`;
  const workspaceId = `${prefix}-ws`;
  const projectId = `${prefix}-proj`;
  created.userId = userId;
  created.workspaceId = workspaceId;

  await prisma.user.create({
    data: {
      id: userId,
      firstName: "Ana",
      lastName: "Teste",
      name: "Ana Teste",
      email: `${userId}@example.com`,
      initials: "AT",
      role: "Direção",
      access: "admin",
    },
  });
  await prisma.workspace.create({
    data: {
      id: workspaceId,
      name: "Espaço",
      members: {
        create: { userId, access: "admin", status: "active", role: "Direção", owner: true },
      },
      projects: {
        create: {
          id: projectId,
          name: "Campanha",
          color: "#0284c7",
          description: "",
          ownerId: userId,
          createdAt: "2026-11-03",
          members: { create: { userId } },
          sections: { create: { id: `${prefix}-s1`, name: "Geral", position: 0 } },
        },
      },
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

  const task = await createTask(actor, { projectId, title: "Peça nova" });
  assert.equal(task.createdById, userId);
  assert.equal(task.createdByName, "Ana Teste");

  const renamed = await updateTask(actor, task.id, { title: "Peça revisada" });
  assert.equal(renamed.createdById, userId);
  assert.equal(renamed.createdByName, "Ana Teste");
  assert.equal(renamed.title, "Peça revisada");

  const subtask = await addSubtask(actor, task.id, "Revisar texto");
  assert.equal(subtask.createdById, userId);
  assert.equal(subtask.createdByName, "Ana Teste");
  assert.equal(subtask.parentId, task.id);
});
