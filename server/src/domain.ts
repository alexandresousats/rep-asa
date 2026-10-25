import bcrypt from "bcryptjs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma, Task, User } from "@prisma/client";
import {
  hashesEqual,
  initialsFrom,
  personNameFields,
  randomToken,
  sha256,
  splitPersonName,
  todayISO,
  uid,
} from "./crypto";
import { prisma } from "./db";
import { ApiError } from "./errors";
import { publish } from "./events";
import { sendMail } from "./mail";
import { sanitizeRichText } from "./html";
import {
  publicNotification,
  publicProject,
  publicTag,
  publicTask,
  publicThread,
  publicUser,
  type MembershipView,
  type PublicUser,
} from "./serialize";

export type Actor = PublicUser & {
  workspaceId: string | null;
  workspaceName: string | null;
  owner: boolean;
  apiKeyId?: string;
};

const taskInclude = {
  tags: { select: { tagId: true } },
  comments: { orderBy: { createdAt: "asc" as const } },
  followers: { select: { userId: true } },
  attachments: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.TaskInclude;

const projectInclude = {
  members: { select: { userId: true } },
  sections: { orderBy: { position: "asc" as const } },
} satisfies Prisma.ProjectInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

async function rememberFollower(taskId: string, userId: string | null | undefined) {
  if (!userId) return;
  await prisma.taskFollower.upsert({
    where: { taskId_userId: { taskId, userId } },
    create: { taskId, userId },
    update: {},
  });
}

function publishTask(actor: Actor, task: TaskRow) {
  if (!actor.workspaceId) return;
  publish({ workspaceId: actor.workspaceId, kind: "task", task: publicTask(task) });
}

async function actorFrom(user: User, preferredWorkspaceId: string | null): Promise<Actor> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id, status: "active" },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  const chosen = preferredWorkspaceId
    ? memberships.find((item) => item.workspaceId === preferredWorkspaceId)
    : undefined;
  const current =
    chosen ??
    memberships.find((item) => item.owner) ??
    memberships.find((item) => item.access === "admin") ??
    memberships[0] ??
    null;
  const access = current?.owner ? "admin" : (current?.access ?? "leitura");
  const view: MembershipView | null = current
    ? {
        role: current.role,
        access,
        owner: current.owner,
        status: current.status,
      }
    : null;
  return {
    ...publicUser(user, view),
    access,
    workspaceId: current?.workspaceId ?? null,
    workspaceName: current?.workspace.name ?? null,
    owner: current?.owner ?? false,
  };
}

export async function actorFromSession(token: string, workspaceId: string | null) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return actorFrom(session.user, workspaceId);
}

export async function actorFromApiKey(secret: string) {
  if (!secret.startsWith("asa_")) return null;
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: sha256(secret) },
    include: { user: true },
  });
  if (!key || !hashesEqual(key.keyHash, sha256(secret))) return null;
  if (!key.workspaceId || !key.expiresAt || key.expiresAt.getTime() < Date.now()) return null;
  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });
  const actor = await actorFrom(key.user, key.workspaceId);
  return { ...actor, apiKeyId: key.id };
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { id: uid("ses"), userId, tokenHash: sha256(token), expiresAt },
  });
  return token;
}

export async function destroySession(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

function assertWorkspace(actor: Actor) {
  if (!actor.workspaceId) {
    throw new ApiError(403, "Aceite o convite para entrar num espaço de trabalho.");
  }
}

function assertWritable(actor: Actor) {
  assertWorkspace(actor);
  if (actor.access === "leitura") {
    throw new ApiError(403, "Sua conta está em modo leitura.");
  }
}

function assertAdmin(actor: Actor) {
  assertWorkspace(actor);
  if (actor.access !== "admin") {
    throw new ApiError(403, "Só um administrador pode fazer isso.");
  }
}

async function memberProjectIds(actor: Actor) {
  if (!actor.workspaceId) return [];
  const rows = await prisma.projectMember.findMany({
    where: { userId: actor.id, project: { workspaceId: actor.workspaceId } },
    select: { projectId: true },
  });
  return rows.map((row) => row.projectId);
}

async function activeMemberIds(actor: Actor) {
  if (!actor.workspaceId) return [];
  const rows = await prisma.workspaceMember.findMany({
    where: { workspaceId: actor.workspaceId, status: "active" },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

function taskFilter(_actor: Actor, projectIds: string[]): Prisma.TaskWhereInput {
  return { projectId: { in: projectIds } };
}

async function loadTask(id: string) {
  return prisma.task.findUnique({ where: { id }, include: taskInclude });
}

async function visibleTask(actor: Actor, id: string) {
  const task = await loadTask(id);
  if (!task || !actor.workspaceId) throw new ApiError(404, "Tarefa não encontrada.");
  const project = await prisma.project.findUnique({
    where: { id: task.projectId },
    select: { workspaceId: true },
  });
  if (!project || project.workspaceId !== actor.workspaceId) {
    throw new ApiError(404, "Tarefa não encontrada.");
  }
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: task.projectId, userId: actor.id } },
  });
  if (!member) throw new ApiError(404, "Tarefa não encontrada.");
  return task;
}

async function visibleProject(actor: Actor, id: string) {
  const project = await prisma.project.findUnique({ where: { id }, include: projectInclude });
  if (
    !actor.workspaceId ||
    !project ||
    project.workspaceId !== actor.workspaceId ||
    !project.members.some((member) => member.userId === actor.id)
  ) {
    throw new ApiError(404, "Projeto não encontrado.");
  }
  return project;
}

export async function notify(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  href?: string | null;
  workspaceId?: string | null;
}) {
  if (!input.userId) return;
  await prisma.notification.create({
    data: {
      id: uid("ntf"),
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
    },
  });
  publish({
    workspaceId: input.workspaceId ?? null,
    kind: "notification",
    userId: input.userId,
  });
}

function workspaceNameFor(name: string) {
  const trimmed = name.trim();
  return `Espaço de ${trimmed}`;
}

export async function signup(input: { name: string; email: string; password: string }) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) throw new ApiError(400, "Informe o nome.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError(400, "Informe um e-mail válido.");
  if (input.password.length < 6) {
    throw new ApiError(400, "A senha precisa ter pelo menos 6 caracteres.");
  }
  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken) {
    throw new ApiError(
      400,
      "Não foi possível criar a conta. Se você já tem conta, entre ou redefina a senha.",
    );
  }
  const { firstName, lastName } = splitPersonName(name);
  const person = personNameFields(firstName, lastName);
  const user = await prisma.user.create({
    data: {
      id: uid("u"),
      ...person,
      email,
      passwordHash: await bcrypt.hash(input.password, 10),
      role: "Administrador",
      access: "admin",
    },
  });
  const workspace = await prisma.workspace.create({
    data: {
      id: uid("ws"),
      name: workspaceNameFor(name),
      members: {
        create: {
          userId: user.id,
          access: "admin",
          status: "active",
          role: "Administrador",
          owner: true,
          acceptedAt: new Date(),
        },
      },
    },
  });
  const token = await createSession(user.id);
  const actor = await actorFrom(user, workspace.id);
  return { token, user: actor, workspaceId: workspace.id };
}

export async function login(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const attempts = await prisma.loginAttempt.count({
    where: { email: normalized, createdAt: { gt: since } },
  });
  if (attempts >= 8) {
    throw new ApiError(429, "Muitas tentativas. Espere alguns minutos.");
  }
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) {
    await prisma.loginAttempt.create({ data: { id: uid("try"), email: normalized } });
    throw new ApiError(401, "E-mail ou senha inválidos.");
  }
  await prisma.loginAttempt.deleteMany({ where: { email: normalized } });
  const token = await createSession(user.id);
  const actor = await actorFrom(user, null);
  return { token, user: actor, workspaceId: actor.workspaceId };
}

export async function requestReset(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) return;
  const token = randomToken();
  await prisma.resetToken.create({
    data: {
      id: uid("rst"),
      tokenHash: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const origin = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const link = `${origin}/redefinir/nova?token=${token}`;
  try {
    await sendMail({
      to: user.email,
      subject: "Redefinir senha do ASA",
      text: `Use este link para escolher uma nova senha. Ele vale por 1 hora.\n\n${link}`,
    });
  } catch (error) {
    console.error("[mail] falha ao enviar redefinição", error);
  }
}

export async function confirmReset(token: string, password: string) {
  if (password.length < 6) {
    throw new ApiError(400, "A senha precisa ter pelo menos 6 caracteres.");
  }
  const row = await prisma.resetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, "Link inválido ou expirado.");
  }
  await prisma.user.update({
    where: { id: row.userId },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  await prisma.resetToken.delete({ where: { id: row.id } });
  await prisma.session.deleteMany({ where: { userId: row.userId } });
}

async function visibleUserIds(actor: Actor) {
  if (!actor.workspaceId) return [];
  const active = new Set(await activeMemberIds(actor));
  if (actor.access === "admin") return [...active];
  const projectIds = await memberProjectIds(actor);
  const members = await prisma.projectMember.findMany({
    where: { projectId: { in: projectIds } },
    select: { userId: true },
  });
  return [...new Set([actor.id, ...members.map((member) => member.userId)])].filter((id) =>
    active.has(id),
  );
}

export async function listUsers(actor: Actor) {
  if (!actor.workspaceId) return [];
  const ids = actor.access === "admin" ? null : await visibleUserIds(actor);
  const memberships = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: actor.workspaceId,
      ...(ids ? { userId: { in: ids }, status: "active" as const } : {}),
    },
    include: { user: true },
  });
  return memberships
    .map((membership) =>
      publicUser(membership.user, {
        role: membership.role,
        access: membership.access,
        owner: membership.owner,
        status: membership.status,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function listTeam(actor: Actor) {
  assertAdmin(actor);
  return listUsers(actor);
}

export async function updateUser(
  actor: Actor,
  id: string,
  patch: {
    firstName?: string;
    lastName?: string;
    name?: string;
    email?: string;
    role?: string;
    access?: Actor["access"];
    avatar?: string | null;
    password?: string;
    currentPassword?: string;
  },
) {
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) throw new ApiError(404, "Perfil não encontrado.");
  const membership = actor.workspaceId
    ? await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: id } },
      })
    : null;
  if (actor.id !== current.id) {
    if (!membership || actor.access !== "admin") {
      throw new ApiError(403, "Você não pode editar este perfil.");
    }
  }

  let firstName = current.firstName;
  let lastName = current.lastName;
  if (patch.firstName !== undefined || patch.lastName !== undefined) {
    firstName = (patch.firstName ?? current.firstName).trim();
    lastName = (patch.lastName ?? current.lastName).trim();
  } else if (patch.name !== undefined) {
    const split = splitPersonName(patch.name);
    firstName = split.firstName;
    lastName = split.lastName;
  }
  const person = personNameFields(firstName, lastName);
  if (!person.firstName) throw new ApiError(400, "Informe o nome.");
  const email = (patch.email !== undefined ? patch.email : current.email).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError(400, "Informe um e-mail válido.");
  const taken = await prisma.user.findFirst({ where: { email, NOT: { id } } });
  if (taken) throw new ApiError(400, "Este e-mail já está em uso.");
  const role = (patch.role !== undefined ? patch.role : (membership?.role ?? current.role)).trim();
  if (!role) throw new ApiError(400, "Informe o cargo.");

  let access = membership?.access ?? current.access;
  if (membership?.owner) {
    access = "admin";
  } else if (patch.access && actor.access === "admin" && membership) {
    access = patch.access;
  }
  if (
    membership &&
    !membership.owner &&
    membership.status === "active" &&
    membership.access === "admin" &&
    access !== "admin"
  ) {
    const others = await prisma.workspaceMember.count({
      where: {
        workspaceId: membership.workspaceId,
        status: "active",
        access: "admin",
        userId: { not: id },
      },
    });
    if (others === 0) {
      throw new ApiError(400, "Precisa existir pelo menos um administrador.");
    }
  }

  let passwordHash = current.passwordHash;
  if (patch.password !== undefined) {
    if (patch.password.length < 6) {
      throw new ApiError(400, "A senha precisa ter pelo menos 6 caracteres.");
    }
    if (actor.id === current.id) {
      if (!patch.currentPassword) throw new ApiError(400, "Informe a senha atual.");
      const matches = await bcrypt.compare(patch.currentPassword, current.passwordHash);
      if (!matches) throw new ApiError(400, "A senha atual não confere.");
    }
    passwordHash = await bcrypt.hash(patch.password, 10);
  }

  if (patch.avatar && patch.avatar.length > 500_000) {
    throw new ApiError(400, "A imagem é grande demais.");
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      firstName: person.firstName,
      lastName: person.lastName,
      name: person.name,
      email,
      role: actor.id === current.id ? role : current.role,
      passwordHash,
      initials: person.initials,
      avatar: patch.avatar === undefined ? current.avatar : patch.avatar,
    },
  });
  const nextMembership = membership
    ? await prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId: membership.workspaceId, userId: id } },
        data: { role, access },
      })
    : null;
  return publicUser(
    user,
    nextMembership
      ? {
          role: nextMembership.role,
          access: nextMembership.access,
          owner: nextMembership.owner,
          status: nextMembership.status,
        }
      : null,
  );
}

export async function addMember(
  actor: Actor,
  input: {
    name: string;
    email: string;
    password?: string;
    role: string;
    access: Actor["access"];
    projectId?: string;
  },
) {
  assertAdmin(actor);
  const name = input.name.trim();
  const role = input.role.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) throw new ApiError(400, "Informe o nome.");
  if (!role) throw new ApiError(400, "Informe o cargo.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError(400, "Informe um e-mail válido.");
  if (!actor.workspaceId) throw new ApiError(403, "Aceite o convite para entrar num espaço de trabalho.");

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    if (!input.password || input.password.length < 6) {
      throw new ApiError(400, "Informe uma senha para criar a conta.");
    }
    const { firstName, lastName } = splitPersonName(name);
    const person = personNameFields(firstName, lastName);
    user = await prisma.user.create({
      data: {
        id: uid("u"),
        ...person,
        email,
        passwordHash: await bcrypt.hash(input.password, 10),
        role,
        access: input.access,
      },
    });
  } else if (input.password && input.password.length >= 6) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(input.password, 10),
        role,
        access: input.access,
      },
    });
  }
  if (user.id === actor.id) throw new ApiError(400, "Você já faz parte deste espaço.");

  const existing = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: user.id } },
  });
  if (existing?.status === "active") {
    throw new ApiError(400, "Esta pessoa já faz parte do espaço.");
  }
  if (existing?.status === "pending") {
    throw new ApiError(400, "Esta pessoa já tem um convite pendente.");
  }

  const isClient = input.access === "cliente";
  const membership = await prisma.workspaceMember.create({
    data: {
      workspaceId: actor.workspaceId,
      userId: user.id,
      access: input.access,
      status: isClient ? "active" : "pending",
      role,
      owner: false,
      invitedById: actor.id,
      acceptedAt: isClient ? new Date() : null,
    },
  });

  if (input.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, workspaceId: actor.workspaceId },
    });
    if (project) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: user.id } },
        create: { projectId: project.id, userId: user.id },
        update: {},
      });
    }
  }

  const workspace = await prisma.workspace.findUnique({ where: { id: actor.workspaceId } });
  await notify({
    userId: user.id,
    workspaceId: actor.workspaceId,
    type: "workspace_invite",
    title: isClient ? "Credenciais de cliente criadas" : "Convite para um espaço",
    body: `${actor.name} cadastrou seu acesso em ${workspace?.name ?? "um espaço de trabalho"}.`,
  });
  return publicUser(user, {
    role: membership.role,
    access: membership.access,
    owner: false,
    status: membership.status,
  });
}

export async function acceptInvite(actor: Actor, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actor.id } },
  });
  if (!membership || membership.status !== "pending") {
    throw new ApiError(404, "Convite não encontrado.");
  }
  await prisma.workspaceMember.update({
    where: { workspaceId_userId: { workspaceId, userId: actor.id } },
    data: { status: "active", acceptedAt: new Date() },
  });
  await prisma.notification.updateMany({
    where: { userId: actor.id, workspaceId, type: "workspace_invite", readAt: null },
    data: { readAt: new Date() },
  });
}

export async function declineInvite(actor: Actor, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actor.id } },
  });
  if (!membership || membership.status !== "pending") {
    throw new ApiError(404, "Convite não encontrado.");
  }
  await prisma.notification.deleteMany({
    where: { userId: actor.id, workspaceId, type: "workspace_invite" },
  });
  await prisma.workspaceMember.delete({
    where: { workspaceId_userId: { workspaceId, userId: actor.id } },
  });
}

export async function createWorkspace(actor: Actor, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new ApiError(400, "Informe o nome do espaço.");
  const workspace = await prisma.workspace.create({
    data: {
      id: uid("ws"),
      name: trimmed,
      members: {
        create: {
          userId: actor.id,
          access: "admin",
          status: "active",
          role: "Administrador",
          owner: true,
          acceptedAt: new Date(),
        },
      },
    },
  });
  return { id: workspace.id, name: workspace.name };
}

export async function selectWorkspace(actor: Actor, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actor.id } },
  });
  if (!membership || membership.status !== "active") {
    throw new ApiError(404, "Espaço não encontrado.");
  }
}

export async function listWorkspaces(actor: Actor) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: actor.id, status: "active" },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  return {
    currentWorkspaceId: actor.workspaceId,
    workspaces: memberships.map((item) => ({
      id: item.workspace.id,
      name: item.workspace.name,
      role: item.role,
      access: item.access,
      owner: item.owner,
      current: item.workspace.id === actor.workspaceId,
    })),
  };
}

export async function selectApiKeyWorkspace(actor: Actor, workspaceId: string) {
  if (!actor.apiKeyId) throw new ApiError(400, "Esta sessão não usa uma chave de API.");
  const key = await prisma.apiKey.findUnique({ where: { id: actor.apiKeyId } });
  if (!key?.workspaceId || key.workspaceId !== workspaceId) {
    throw new ApiError(403, "Esta chave só acessa o espaço em que foi criada.");
  }
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actor.id } },
    include: { workspace: true },
  });
  if (!membership || membership.status !== "active") {
    throw new ApiError(404, "Espaço não encontrado.");
  }
  actor.workspaceId = workspaceId;
  actor.workspaceName = membership.workspace.name;
  actor.access = membership.owner ? "admin" : membership.access;
  actor.role = membership.role;
  actor.owner = membership.owner;
  actor.membershipStatus = membership.status;
  return {
    id: membership.workspace.id,
    name: membership.workspace.name,
    role: membership.role,
    access: membership.access,
    owner: membership.owner,
    current: true,
  };
}

export async function renameWorkspace(actor: Actor, name: string) {
  assertAdmin(actor);
  const trimmed = name.trim();
  if (!trimmed) throw new ApiError(400, "Informe o nome do espaço.");
  if (!actor.workspaceId) throw new ApiError(400, "Nenhum espaço selecionado.");
  const workspace = await prisma.workspace.update({
    where: { id: actor.workspaceId },
    data: { name: trimmed },
  });
  return { id: workspace.id, name: workspace.name };
}

export async function deleteWorkspace(actor: Actor, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actor.id } },
  });
  if (!membership || membership.status !== "active") {
    throw new ApiError(404, "Espaço não encontrado.");
  }
  if (!membership.owner && membership.access !== "admin") {
    throw new ApiError(403, "Só um administrador pode fazer isso.");
  }
  const wasCurrent = actor.workspaceId === workspaceId;
  await prisma.workspace.delete({ where: { id: workspaceId } });
  if (!wasCurrent) return { nextWorkspaceId: actor.workspaceId };
  const next = await prisma.workspaceMember.findFirst({
    where: { userId: actor.id, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  const nextWorkspaceId = next?.workspaceId ?? null;
  if (actor.apiKeyId) {
    await prisma.apiKey.update({
      where: { id: actor.apiKeyId },
      data: { workspaceId: nextWorkspaceId },
    });
  }
  return { nextWorkspaceId };
}

async function loadProjects(actor: Actor) {
  const projectIds = await memberProjectIds(actor);
  return prisma.project.findMany({
    where: { id: { in: projectIds } },
    include: projectInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function listProjects(actor: Actor) {
  const projects = await loadProjects(actor);
  return projects.map(publicProject);
}

export async function createProject(
  actor: Actor,
  input: { name: string; description?: string; color: string },
) {
  assertAdmin(actor);
  const name = input.name.trim();
  if (!name) throw new ApiError(400, "Informe o nome do projeto.");
  const project = await prisma.project.create({
    data: {
      id: uid("p"),
      name,
      description: input.description?.trim() ?? "",
      color: input.color,
      ownerId: actor.id,
      workspaceId: actor.workspaceId!,
      createdAt: todayISO(),
      members: { create: { userId: actor.id } },
      sections: { create: { id: uid("sec"), name: "Geral", position: 0 } },
    },
    include: projectInclude,
  });
  return publicProject(project);
}

export async function updateProject(
  actor: Actor,
  id: string,
  input: { name?: string; description?: string; color?: string },
) {
  assertAdmin(actor);
  const project = await visibleProject(actor, id);
  const data: { name?: string; description?: string; color?: string } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ApiError(400, "Informe o nome do projeto.");
    data.name = name;
  }
  if (input.description !== undefined) data.description = input.description.trim();
  if (input.color !== undefined) {
    const color = input.color.trim();
    if (!color) throw new ApiError(400, "Informe a cor do projeto.");
    data.color = color;
  }
  const next = await prisma.project.update({
    where: { id: project.id },
    data,
    include: projectInclude,
  });
  return publicProject(next);
}

export async function createSection(actor: Actor, projectId: string, name: string) {
  assertAdmin(actor);
  const project = await visibleProject(actor, projectId);
  const trimmed = name.trim();
  if (!trimmed) throw new ApiError(400, "Informe o nome da sessão.");
  const existing = project.sections.find(
    (section) => section.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing) return existing.name;
  const position = project.sections.reduce((max, section) => Math.max(max, section.position), -1) + 1;
  await prisma.section.create({
    data: { id: uid("sec"), projectId, name: trimmed, position },
  });
  return trimmed;
}

export async function renameSection(actor: Actor, projectId: string, from: string, to: string) {
  assertAdmin(actor);
  const project = await visibleProject(actor, projectId);
  const trimmed = to.trim();
  if (!trimmed) throw new ApiError(400, "Informe o nome da sessão.");
  const current = project.sections.find((section) => section.name === from);
  if (!current) throw new ApiError(404, "Sessão não encontrada.");
  if (trimmed === from) return from;
  const clash = project.sections.find(
    (section) => section.name !== from && section.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (clash) throw new ApiError(400, "Já existe uma sessão com esse nome.");
  await prisma.$transaction([
    prisma.section.update({ where: { id: current.id }, data: { name: trimmed } }),
    prisma.task.updateMany({
      where: { projectId, section: from },
      data: { section: trimmed },
    }),
  ]);
  return trimmed;
}

export async function deleteSection(actor: Actor, projectId: string, name: string) {
  assertAdmin(actor);
  const project = await visibleProject(actor, projectId);
  if (project.sections.length <= 1) {
    throw new ApiError(400, "O projeto precisa de pelo menos uma sessão.");
  }
  const ordered = [...project.sections].sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((section) => section.name === name);
  if (index < 0) throw new ApiError(404, "Sessão não encontrada.");
  const current = ordered[index];
  const fallback = ordered[index - 1] ?? ordered[index + 1];
  await prisma.$transaction([
    prisma.task.updateMany({
      where: { projectId, section: name },
      data: { section: fallback.name },
    }),
    prisma.section.delete({ where: { id: current.id } }),
  ]);
  return fallback.name;
}

export async function reorderSections(actor: Actor, projectId: string, names: string[]) {
  assertAdmin(actor);
  const project = await visibleProject(actor, projectId);
  const known = new Map(project.sections.map((section) => [section.name, section]));
  if (names.length !== known.size || names.some((name) => !known.has(name))) {
    throw new ApiError(400, "A ordem das sessões está incompleta.");
  }
  await prisma.$transaction(
    names.map((name, position) =>
      prisma.section.update({
        where: { id: known.get(name)!.id },
        data: { position },
      }),
    ),
  );
}

export async function addProjectMember(actor: Actor, projectId: string, userId: string) {
  assertAdmin(actor);
  const project = await visibleProject(actor, projectId);
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: actor.workspaceId!, userId } },
  });
  if (!membership || membership.status !== "active") {
    throw new ApiError(400, "Essa pessoa ainda não aceitou o convite.");
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "Pessoa não encontrada.");
  const already = project.members.some((member) => member.userId === userId);
  if (!already) {
    await prisma.projectMember.create({ data: { projectId, userId } });
    await notify({
      userId,
      type: "project_member",
      title: "Você entrou num projeto",
      body: `${actor.name} adicionou você em ${project.name}.`,
      href: `/projetos/${project.id}`,
    });
  }
  const next = await visibleProject(actor, projectId);
  return publicProject(next);
}

export async function deleteProject(actor: Actor, id: string) {
  assertAdmin(actor);
  const project = await visibleProject(actor, id);
  await prisma.$transaction([
    prisma.thread.updateMany({ where: { projectId: project.id }, data: { projectId: null } }),
    prisma.project.delete({ where: { id: project.id } }),
  ]);
}

export async function deleteTask(actor: Actor, id: string) {
  assertWritable(actor);
  const task = await visibleTask(actor, id);
  const files = task.attachments.map((file) => file.id);
  await prisma.task.delete({ where: { id: task.id } });
  await Promise.all(files.map((fileId) => removeStoredFile(fileId)));
  if (actor.workspaceId) {
    publish({ workspaceId: actor.workspaceId, kind: "task-removed", taskId: task.id });
  }
}

export async function removeMember(actor: Actor, userId: string) {
  assertAdmin(actor);
  const workspaceId = actor.workspaceId!;
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!membership) throw new ApiError(404, "Pessoa não encontrada neste espaço.");
  if (membership.owner) throw new ApiError(400, "O dono do espaço não pode ser removido.");

  const projects = await prisma.project.findMany({
    where: { workspaceId },
    select: { id: true },
  });
  const threads = await prisma.thread.findMany({
    where: { workspaceId },
    select: { id: true },
  });
  const projectIds = projects.map((project) => project.id);
  const threadIds = threads.map((thread) => thread.id);

  await prisma.$transaction([
    prisma.task.updateMany({
      where: { projectId: { in: projectIds }, assigneeId: userId },
      data: { assigneeId: null },
    }),
    prisma.projectMember.deleteMany({ where: { userId, projectId: { in: projectIds } } }),
    prisma.threadParticipant.deleteMany({ where: { userId, threadId: { in: threadIds } } }),
    prisma.notification.deleteMany({
      where: { userId, workspaceId, type: "workspace_invite" },
    }),
    prisma.apiKey.updateMany({
      where: { userId, workspaceId },
      data: { workspaceId: null },
    }),
    prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId } },
    }),
  ]);
}

async function loadTasks(actor: Actor) {
  const projectIds = await memberProjectIds(actor);
  return prisma.task.findMany({
    where: taskFilter(actor, projectIds),
    include: taskInclude,
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
}

export async function listTasks(actor: Actor, projectId?: string) {
  const tasks = await loadTasks(actor);
  const visible = projectId ? tasks.filter((task) => task.projectId === projectId) : tasks;
  return visible.map(publicTask);
}

export async function createTask(
  actor: Actor,
  input: {
    projectId: string;
    title: string;
    description?: string;
    assigneeId?: string | null;
    dueDate?: string | null;
    startDate?: string | null;
    priority?: Task["priority"];
    tagIds?: string[];
    section?: string;
    isDemand?: boolean;
    demandFormat?: string | null;
    referenceUrls?: string | null;
  },
) {
  assertWritable(actor);
  const project = await visibleProject(actor, input.projectId);
  const title = input.title.trim();
  if (!title) throw new ApiError(400, "Informe o título.");
  const section = input.section?.trim() || project.sections[0]?.name || "Geral";
  if (!project.sections.some((item) => item.name === section)) {
    throw new ApiError(400, "Sessão não encontrada.");
  }
  const assigneeId =
    input.assigneeId === undefined
      ? actor.access === "cliente"
        ? null
        : actor.id
      : input.assigneeId;
  if (assigneeId) {
    const member = project.members.some((item) => item.userId === assigneeId);
    if (!member) throw new ApiError(400, "O responsável não participa deste projeto.");
  }
  if (input.tagIds?.length) await assertWorkspaceTags(actor, input.tagIds);
  const order =
    (await prisma.task.aggregate({
      where: { projectId: project.id, section, parentId: null },
      _max: { order: true },
    }))._max.order ?? -1;
  const task = await prisma.task.create({
    data: {
      id: uid("task"),
      projectId: project.id,
      title,
      description: sanitizeRichText(input.description ?? ""),
      assigneeId,
      dueDate: input.dueDate ?? null,
      startDate: input.startDate ?? input.dueDate ?? null,
      priority: input.priority ?? "media",
      status: "todo",
      section,
      order: order + 1,
      createdAt: new Date().toISOString(),
      isDemand: input.isDemand ?? false,
      demandFormat: input.demandFormat ?? null,
      referenceUrls: input.referenceUrls?.trim() ?? null,
      approvalStatus: "none",
      tags: input.tagIds?.length
        ? { create: input.tagIds.map((tagId) => ({ tagId })) }
        : undefined,
    },
    include: taskInclude,
  });
  if (assigneeId && assigneeId !== actor.id) {
    await notify({
      userId: assigneeId,
      type: "task_assigned",
      title: "Nova tarefa",
      body: `${actor.name} atribuiu “${task.title}” a você.`,
      href: `/projetos/${task.projectId}?task=${task.id}`,
      workspaceId: actor.workspaceId,
    });
  }
  if (input.isDemand) {
    const others = project.members.filter((m) => m.userId !== actor.id);
    for (const member of others) {
      await notify({
        userId: member.userId,
        type: "demand_created",
        title: "Nova solicitação de demanda",
        body: `${actor.name} solicitou uma demanda: “${task.title}”.`,
        href: `/projetos/${task.projectId}?task=${task.id}`,
        workspaceId: actor.workspaceId,
      });
    }
  }
  await rememberFollower(task.id, assigneeId);
  const saved = await loadTask(task.id);
  if (!saved) throw new ApiError(404, "Tarefa não encontrada.");
  publishTask(actor, saved);
  return publicTask(saved);
}

const editorFields = new Set([
  "title",
  "description",
  "assigneeId",
  "dueDate",
  "startDate",
  "priority",
  "status",
  "tagIds",
  "section",
  "order",
  "projectId",
  "isDemand",
  "demandFormat",
  "referenceUrls",
]);

export async function updateTask(
  actor: Actor,
  id: string,
  patch: {
    title?: string;
    description?: string;
    assigneeId?: string | null;
    dueDate?: string | null;
    startDate?: string | null;
    priority?: Task["priority"];
    status?: Task["status"];
    tagIds?: string[];
    section?: string;
    order?: number;
    projectId?: string;
    isDemand?: boolean;
    demandFormat?: string | null;
    referenceUrls?: string | null;
  },
) {
  assertWritable(actor);
  const task = await visibleTask(actor, id);
  if (actor.access !== "admin") {
    for (const key of Object.keys(patch)) {
      if (!editorFields.has(key)) {
        throw new ApiError(403, "Você não pode alterar esse campo.");
      }
    }
  }
  const data: Prisma.TaskUpdateInput = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) throw new ApiError(400, "Informe o título.");
    data.title = title;
  }
  if (patch.description !== undefined) data.description = sanitizeRichText(patch.description);
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;
  if (patch.startDate !== undefined) data.startDate = patch.startDate;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.order !== undefined) data.order = patch.order;
  if (patch.isDemand !== undefined) data.isDemand = patch.isDemand;
  if (patch.demandFormat !== undefined) data.demandFormat = patch.demandFormat;
  if (patch.referenceUrls !== undefined) data.referenceUrls = patch.referenceUrls;
  if (patch.status !== undefined) {
    data.status = patch.status;
    data.completedAt = patch.status === "done" ? todayISO() : null;
  }
  let targetProjectId = task.projectId;
  if (patch.projectId !== undefined && patch.projectId !== task.projectId) {
    const targetProject = await visibleProject(actor, patch.projectId);
    targetProjectId = targetProject.id;
    data.project = { connect: { id: targetProject.id } };

    let nextSection = patch.section;
    if (!nextSection || !targetProject.sections.some((s) => s.name === nextSection)) {
      if (targetProject.sections.some((s) => s.name === task.section)) {
        nextSection = task.section;
      } else {
        nextSection = targetProject.sections[0]?.name ?? "A Fazer";
      }
    }
    data.section = nextSection;

    await prisma.task.updateMany({
      where: { parentId: id },
      data: { projectId: targetProject.id },
    });
  } else if (patch.section !== undefined) {
    const project = await visibleProject(actor, task.projectId);
    if (!project.sections.some((section) => section.name === patch.section)) {
      throw new ApiError(400, "Sessão não encontrada.");
    }
    data.section = patch.section;
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId) {
    if (patch.assigneeId) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: targetProjectId, userId: patch.assigneeId } },
      });
      if (!member) throw new ApiError(400, "O responsável não participa deste projeto.");
    }
    data.assignee = patch.assigneeId
      ? { connect: { id: patch.assigneeId } }
      : { disconnect: true };
  } else if (patch.projectId !== undefined && patch.projectId !== task.projectId && task.assigneeId) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: targetProjectId, userId: task.assigneeId } },
    });
    if (!member) {
      data.assignee = { disconnect: true };
    }
  }
  const next = await prisma.task.update({ where: { id }, data, include: taskInclude });
  if (patch.tagIds) {
    await assertWorkspaceTags(actor, patch.tagIds);
    await prisma.taskTag.deleteMany({ where: { taskId: id } });
    if (patch.tagIds.length) {
      await prisma.taskTag.createMany({
        data: patch.tagIds.map((tagId) => ({ taskId: id, tagId })),
      });
    }
  }
  const saved = patch.tagIds ? await loadTask(id) : next;
  if (!saved) throw new ApiError(404, "Tarefa não encontrada.");
  if (
    patch.assigneeId &&
    patch.assigneeId !== task.assigneeId &&
    patch.assigneeId !== actor.id
  ) {
    await notify({
      userId: patch.assigneeId,
      type: "task_assigned",
      title: "Tarefa atribuída",
      body: `${actor.name} atribuiu “${saved.title}” a você.`,
      href: `/projetos/${saved.projectId}?task=${saved.id}`,
      workspaceId: actor.workspaceId,
    });
  }
  if (patch.assigneeId && patch.assigneeId !== task.assigneeId) {
    await rememberFollower(saved.id, patch.assigneeId);
  }
  const fresh = (await loadTask(saved.id)) ?? saved;
  publishTask(actor, fresh);
  return publicTask(fresh);
}

export async function updateTaskApproval(
  actor: Actor,
  id: string,
  input: {
    status: "none" | "pending" | "approved" | "changes_requested";
    feedback?: string;
  },
) {
  const task = await visibleTask(actor, id);
  const deciding = input.status === "approved" || input.status === "changes_requested";
  if (deciding) {
    if (actor.access !== "cliente") {
      throw new ApiError(403, "Só o cliente pode aprovar ou pedir ajustes.");
    }
  } else if (actor.access !== "admin" && actor.access !== "editor") {
    throw new ApiError(403, "Só a equipe pode enviar a demanda para aprovação.");
  }
  const feedback = input.feedback?.trim() ?? "";
  const now = new Date().toISOString();

  let autoComment = "";
  if (input.status === "approved") {
    autoComment = feedback
      ? `✅ Demanda aprovada pelo cliente.\nObservação: ${feedback}`
      : `✅ Demanda aprovada pelo cliente.`;
  } else if (input.status === "changes_requested") {
    autoComment = `⚠️ Ajustes solicitados pelo cliente:\n${feedback || "Por favor, verificar os ajustes necessários."}`;
  } else if (input.status === "pending") {
    autoComment = `⏳ Demanda enviada para aprovação do cliente.`;
  }

  await prisma.task.update({
    where: { id },
    data: {
      approvalStatus: input.status,
      approvalFeedback: feedback || null,
      approvedAt:
        input.status === "approved" || input.status === "changes_requested" ? now : null,
      approvedById:
        input.status === "approved" || input.status === "changes_requested" ? actor.id : null,
    },
  });

  if (autoComment) {
    await prisma.comment.create({
      data: {
        id: uid("c"),
        taskId: id,
        authorId: actor.id,
        body: autoComment,
        createdAt: now,
      },
    });
  }

  const project = await prisma.project.findUnique({
    where: { id: task.projectId },
    include: { members: { include: { user: true } } },
  });
  if (project) {
    const recipients = project.members
      .map((m) => m.userId)
      .filter((uid) => uid !== actor.id);
    for (const userId of recipients) {
      let title = "Status de aprovação atualizado";
      let body = `${actor.name} atualizou o status de aprovação de “${task.title}”.`;
      if (input.status === "approved") {
        title = "Demanda aprovada!";
        body = `${actor.name} aprovou a demanda “${task.title}”.`;
      } else if (input.status === "changes_requested") {
        title = "Ajustes solicitados!";
        body = `${actor.name} solicitou ajustes na demanda “${task.title}”: ${feedback}`;
      } else if (input.status === "pending") {
        title = "Demanda para aprovação";
        body = `${actor.name} enviou a tarefa “${task.title}” para aprovação.`;
      }
      await notify({
        userId,
        type: "task_approval",
        title,
        body,
        href: `/projetos/${task.projectId}?task=${task.id}`,
        workspaceId: actor.workspaceId,
      });
    }
  }

  const fresh = await loadTask(id);
  if (!fresh) throw new ApiError(404, "Tarefa não encontrada.");
  publishTask(actor, fresh);
  return publicTask(fresh);
}

export async function addSubtask(
  actor: Actor,
  taskId: string,
  title: string,
  dueDate?: string | null,
) {
  assertWritable(actor);
  const parent = await visibleTask(actor, taskId);
  const trimmed = title.trim();
  if (!trimmed) throw new ApiError(400, "Informe o título.");
  const due = dueDate?.trim() || null;
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    throw new ApiError(400, "Informe a data no formato AAAA-MM-DD.");
  }
  const assigneeId = parent.assigneeId ?? actor.id;
  const task = await prisma.task.create({
    data: {
      id: uid("task"),
      projectId: parent.projectId,
      title: trimmed,
      description: "",
      assigneeId,
      dueDate: due,
      startDate: due,
      priority: "media",
      status: "todo",
      section: parent.section,
      parentId: parent.id,
      createdAt: new Date().toISOString(),
    },
    include: taskInclude,
  });
  if (assigneeId !== actor.id) {
    await notify({
      userId: assigneeId,
      type: "task_assigned",
      title: "Nova subtarefa",
      body: `${actor.name} adicionou “${task.title}” em “${parent.title}”.`,
      href: `/projetos/${task.projectId}?task=${task.id}`,
    });
  }
  const saved = await loadTask(task.id);
  if (!saved) throw new ApiError(404, "Tarefa não encontrada.");
  publishTask(actor, saved);
  return publicTask(saved);
}

export async function addComment(actor: Actor, taskId: string, body: string) {
  assertWritable(actor);
  const task = await visibleTask(actor, taskId);
  const text = body.trim();
  if (!text) throw new ApiError(400, "Escreva um comentário.");
  await prisma.comment.create({
    data: {
      id: uid("c"),
      taskId,
      authorId: actor.id,
      body: text,
      createdAt: new Date().toISOString(),
    },
  });
  await rememberFollower(taskId, actor.id);
  const members = await prisma.projectMember.findMany({
    where: { projectId: task.projectId },
    include: { user: true },
  });
  const mentioned = mentionIds(
    text,
    members.map((member) => member.user),
  );
  const followers = await prisma.taskFollower.findMany({
    where: { taskId },
    select: { userId: true },
  });
  const recipients = new Set<string>([
    ...mentioned,
    ...followers.map((follower) => follower.userId),
  ]);
  recipients.delete(actor.id);
  for (const userId of recipients) {
    const cited = mentioned.includes(userId);
    await notify({
      userId,
      type: cited ? "mention" : "comment",
      title: cited ? "Menção" : "Novo comentário",
      body: cited
        ? `${actor.name} mencionou você em “${task.title}”.`
        : `${actor.name} comentou em “${task.title}”.`,
      href: `/projetos/${task.projectId}?task=${task.id}`,
      workspaceId: actor.workspaceId,
    });
  }
  const saved = await loadTask(taskId);
  if (!saved) throw new ApiError(404, "Tarefa não encontrada.");
  publishTask(actor, saved);
  return publicTask(saved);
}

const attachmentDir = path.join(process.cwd(), "server/data/attachments");

async function removeStoredFile(id: string) {
  await unlink(path.join(attachmentDir, id)).catch(() => undefined);
}

function mentionIds(text: string, people: { id: string; name: string }[]) {
  const found: string[] = [];
  let rest = text;
  const sorted = [...people].sort((a, b) => b.name.length - a.name.length);
  for (const person of sorted) {
    const needle = `@${person.name}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(needle, "i");
    if (!pattern.test(rest)) continue;
    found.push(person.id);
    rest = rest.replace(pattern, " ");
  }
  return found;
}

export async function setTaskFollow(actor: Actor, taskId: string, follow: boolean) {
  const task = await visibleTask(actor, taskId);
  if (follow) await rememberFollower(task.id, actor.id);
  else {
    await prisma.taskFollower.deleteMany({ where: { taskId: task.id, userId: actor.id } });
  }
  const saved = await loadTask(task.id);
  if (!saved) throw new ApiError(404, "Tarefa não encontrada.");
  publishTask(actor, saved);
  return publicTask(saved);
}

export async function addAttachment(
  actor: Actor,
  taskId: string,
  file: { name: string; type: string; size: number; bytes: Buffer },
) {
  assertWritable(actor);
  const task = await visibleTask(actor, taskId);
  if (file.size <= 0) throw new ApiError(400, "Envie um arquivo.");
  if (file.size > 10 * 1024 * 1024) throw new ApiError(400, "O arquivo passa de 10 MB.");
  const id = uid("file");
  await mkdir(attachmentDir, { recursive: true });
  await writeFile(path.join(attachmentDir, id), file.bytes);
  await prisma.attachment.create({
    data: {
      id,
      taskId: task.id,
      name: file.name.trim().slice(0, 180) || "arquivo",
      mime: file.type || "application/octet-stream",
      size: file.size,
    },
  });
  const saved = await loadTask(task.id);
  if (!saved) throw new ApiError(404, "Tarefa não encontrada.");
  publishTask(actor, saved);
  return publicTask(saved);
}

export async function removeAttachment(actor: Actor, taskId: string, attachmentId: string) {
  assertWritable(actor);
  const task = await visibleTask(actor, taskId);
  const file = task.attachments.find((item) => item.id === attachmentId);
  if (!file) throw new ApiError(404, "Arquivo não encontrado.");
  await prisma.attachment.delete({ where: { id: file.id } });
  await removeStoredFile(file.id);
  const saved = await loadTask(task.id);
  if (!saved) throw new ApiError(404, "Tarefa não encontrada.");
  publishTask(actor, saved);
  return publicTask(saved);
}

export async function readAttachment(actor: Actor, taskId: string, attachmentId: string) {
  const task = await visibleTask(actor, taskId);
  const file = task.attachments.find((item) => item.id === attachmentId);
  if (!file) throw new ApiError(404, "Arquivo não encontrado.");
  const bytes = await readFile(path.join(attachmentDir, file.id));
  return file && { ...file, bytes };
}

export async function reorderTasks(actor: Actor, ids: string[]) {
  assertWritable(actor);
  const tasks = await Promise.all(ids.map((id) => visibleTask(actor, id)));
  await prisma.$transaction(
    tasks.map((task, index) =>
      prisma.task.update({ where: { id: task.id }, data: { order: index } }),
    ),
  );
}

async function assertWorkspaceTags(actor: Actor, tagIds: string[]) {
  if (!tagIds.length) return;
  if (!actor.workspaceId) throw new ApiError(404, "Tag não encontrada.");
  const count = await prisma.tag.count({
    where: { id: { in: tagIds }, workspaceId: actor.workspaceId },
  });
  if (count !== new Set(tagIds).size) throw new ApiError(400, "Tag não encontrada.");
}

export const EXPLICIT_DEMAND_TAGS = [
  { name: "Card", color: "#0284c7" },
  { name: "Carrossel", color: "#6366f1" },
  { name: "Vídeo Longo", color: "#f59e0b" },
  { name: "Reels", color: "#ec4899" },
];

export async function ensureExplicitTags(workspaceId: string) {
  const existing = await prisma.tag.findMany({ where: { workspaceId } });
  for (const def of EXPLICIT_DEMAND_TAGS) {
    const found = existing.some(
      (t) => t.name.trim().toLowerCase() === def.name.trim().toLowerCase(),
    );
    if (!found) {
      await prisma.tag.create({
        data: {
          id: uid("t"),
          name: def.name,
          color: def.color,
          workspaceId,
        },
      });
    }
  }
}

export async function listTags(actor: Actor) {
  if (!actor.workspaceId) return [];
  await ensureExplicitTags(actor.workspaceId);
  const tags = await prisma.tag.findMany({
    where: { workspaceId: actor.workspaceId },
    orderBy: { name: "asc" },
  });
  return tags.map(publicTag);
}

export async function createTag(actor: Actor, name: string, color: string) {
  assertWritable(actor);
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) throw new ApiError(400, "Informe o nome da tag.");
  const existing = await prisma.tag.findFirst({
    where: { name: trimmed, workspaceId: actor.workspaceId! },
  });
  if (existing) return publicTag(existing);
  const tag = await prisma.tag.create({
    data: { id: uid("t"), name: trimmed, color, workspaceId: actor.workspaceId! },
  });
  return publicTag(tag);
}

export async function updateTag(
  actor: Actor,
  id: string,
  patch: { name?: string; color?: string },
) {
  assertAdmin(actor);
  const current = await prisma.tag.findFirst({
    where: { id, workspaceId: actor.workspaceId! },
  });
  if (!current) throw new ApiError(404, "Tag não encontrada.");
  const tag = await prisma.tag.update({
    where: { id },
    data: {
      name: patch.name !== undefined ? patch.name.trim().toLowerCase() : current.name,
      color: patch.color ?? current.color,
    },
  });
  return publicTag(tag);
}

export async function deleteTag(actor: Actor, id: string) {
  assertAdmin(actor);
  const current = await prisma.tag.findFirst({
    where: { id, workspaceId: actor.workspaceId! },
  });
  if (!current) throw new ApiError(404, "Tag não encontrada.");
  await prisma.tag.delete({ where: { id } });
}

async function visibleThread(actor: Actor, id: string) {
  const thread = await prisma.thread.findUnique({
    where: { id },
    include: { participants: true },
  });
  if (
    !actor.workspaceId ||
    !thread ||
    thread.workspaceId !== actor.workspaceId ||
    !thread.participants.some((person) => person.userId === actor.id)
  ) {
    throw new ApiError(404, "Conversa não encontrada.");
  }
  return thread;
}

export async function listThreads(actor: Actor) {
  if (!actor.workspaceId) return [];
  const threads = await prisma.thread.findMany({
    where: { workspaceId: actor.workspaceId, participants: { some: { userId: actor.id } } },
    include: { participants: true },
    orderBy: { lastMessageAt: "desc" },
  });
  return threads.map(publicThread);
}

export async function listMessages(actor: Actor) {
  const threads = await listThreads(actor);
  const ids = threads.map((thread) => thread.id);
  return prisma.message.findMany({
    where: { threadId: { in: ids } },
    orderBy: { createdAt: "asc" },
  });
}

export async function createThread(
  actor: Actor,
  title: string,
  participantIds: string[],
  projectId?: string | null,
) {
  assertWritable(actor);
  const trimmed = title.trim();
  if (!trimmed) throw new ApiError(400, "Informe o título.");
  const allowed = new Set(await activeMemberIds(actor));
  const ids = [...new Set([actor.id, ...participantIds])];
  if (ids.some((id) => !allowed.has(id))) {
    throw new ApiError(403, "Você não pode incluir essa pessoa.");
  }
  if (projectId) await visibleProject(actor, projectId);
  const thread = await prisma.thread.create({
    data: {
      id: uid("th"),
      title: trimmed,
      projectId: projectId ?? null,
      workspaceId: actor.workspaceId!,
      lastMessageAt: new Date().toISOString(),
      participants: { create: ids.map((userId) => ({ userId })) },
    },
    include: { participants: true },
  });
  return publicThread(thread);
}

export async function sendMessage(actor: Actor, threadId: string, body: string) {
  assertWritable(actor);
  const thread = await visibleThread(actor, threadId);
  const text = body.trim();
  if (!text) throw new ApiError(400, "Escreva uma mensagem.");
  const createdAt = new Date().toISOString();
  const message = await prisma.message.create({
    data: { id: uid("m"), threadId, authorId: actor.id, body: text, createdAt },
  });
  await prisma.thread.update({ where: { id: threadId }, data: { lastMessageAt: createdAt } });
  await Promise.all(
    thread.participants
      .filter((person) => person.userId !== actor.id)
      .map((person) =>
        notify({
          userId: person.userId,
          type: "message",
          title: thread.title,
          body: `${actor.name}: ${text.slice(0, 140)}`,
          href: `/mensagens/${thread.id}`,
        }),
      ),
  );
  return message;
}

export async function listNotifications(actor: Actor) {
  const items = await prisma.notification.findMany({
    where: { userId: actor.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return items.map(publicNotification);
}

export async function markNotificationRead(actor: Actor, id: string) {
  const item = await prisma.notification.findUnique({ where: { id } });
  if (!item || item.userId !== actor.id) throw new ApiError(404, "Notificação não encontrada.");
  const saved = await prisma.notification.update({
    where: { id },
    data: { readAt: item.readAt ?? new Date() },
  });
  return publicNotification(saved);
}

export async function markAllNotificationsRead(actor: Actor) {
  await prisma.notification.updateMany({
    where: { userId: actor.id, readAt: null },
    data: { readAt: new Date() },
  });
  return listNotifications(actor);
}

export async function listApiKeys(actor: Actor) {
  const keys = await prisma.apiKey.findMany({
    where: { userId: actor.id },
    include: { workspace: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
    createdAt: key.createdAt.toISOString(),
    expiresAt: key.expiresAt ? key.expiresAt.toISOString() : null,
    workspaceId: key.workspaceId,
    workspaceName: key.workspace?.name ?? null,
  }));
}

const API_KEY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export async function createApiKey(actor: Actor, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new ApiError(400, "Informe um nome para a chave.");
  if (!actor.workspaceId) throw new ApiError(400, "Selecione um espaço de trabalho.");
  const secret = `asa_${randomToken()}`;
  const expiresAt = new Date(Date.now() + API_KEY_TTL_MS);
  const workspace = await prisma.workspace.findUnique({
    where: { id: actor.workspaceId },
    select: { name: true },
  });
  const key = await prisma.apiKey.create({
    data: {
      id: uid("key"),
      userId: actor.id,
      name: trimmed,
      keyHash: sha256(secret),
      prefix: secret.slice(0, 12),
      workspaceId: actor.workspaceId,
      expiresAt,
    },
  });
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    secret,
    createdAt: key.createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastUsedAt: null,
    workspaceId: actor.workspaceId,
    workspaceName: workspace?.name ?? null,
  };
}

export async function rotateApiKey(actor: Actor, id: string) {
  const key = await prisma.apiKey.findUnique({
    where: { id },
    include: { workspace: { select: { name: true } } },
  });
  if (!key || key.userId !== actor.id) throw new ApiError(404, "Chave não encontrada.");
  if (!key.workspaceId || !key.expiresAt || key.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, "Gere uma chave nova. Esta não pode ser rotacionada.");
  }
  const secret = `asa_${randomToken()}`;
  const updated = await prisma.apiKey.update({
    where: { id },
    data: { keyHash: sha256(secret), prefix: secret.slice(0, 12), lastUsedAt: null },
  });
  return {
    id: updated.id,
    name: updated.name,
    prefix: updated.prefix,
    secret,
    createdAt: updated.createdAt.toISOString(),
    expiresAt: key.expiresAt.toISOString(),
    lastUsedAt: null,
    workspaceId: key.workspaceId,
    workspaceName: key.workspace?.name ?? null,
  };
}

export async function deleteApiKey(actor: Actor, id: string) {
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key || key.userId !== actor.id) throw new ApiError(404, "Chave não encontrada.");
  await prisma.apiKey.delete({ where: { id } });
}

export async function bootstrap(actor: Actor) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: actor.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  const workspaces = memberships
    .filter((item) => item.status === "active")
    .map((item) => ({
      id: item.workspace.id,
      name: item.workspace.name,
      access: item.access,
    }));
  const invites = memberships
    .filter((item) => item.status === "pending")
    .map((item) => ({
      workspaceId: item.workspace.id,
      workspaceName: item.workspace.name,
      role: item.role,
      access: item.access,
    }));
  const current = workspaces.find((item) => item.id === actor.workspaceId) ?? null;
  if (!actor.workspaceId) {
    return {
      user: actor,
      workspace: null,
      workspaces,
      invites,
      users: [],
      projects: [],
      tasks: [],
      tags: [],
      threads: [],
      messages: [],
      notifications: await listNotifications(actor),
    };
  }
  const [users, projects, tasks, tags, threads, messages, notifications] = await Promise.all([
    listUsers(actor),
    listProjects(actor),
    listTasks(actor),
    listTags(actor),
    listThreads(actor),
    listMessages(actor),
    listNotifications(actor),
  ]);
  return {
    user: actor,
    workspace: current,
    workspaces,
    invites,
    users,
    projects,
    tasks,
    tags,
    threads,
    messages,
    notifications,
  };
}
