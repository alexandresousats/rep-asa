import bcrypt from "bcryptjs";
import type { Prisma, Task, User } from "@prisma/client";
import { hashesEqual, initialsFrom, randomToken, sha256, todayISO, uid } from "./crypto";
import { prisma } from "./db";
import { ApiError } from "./errors";
import {
  publicNotification,
  publicProject,
  publicTag,
  publicTask,
  publicThread,
  publicUser,
  type PublicUser,
} from "./serialize";

export type Actor = PublicUser;

const taskInclude = {
  tags: { select: { tagId: true } },
  comments: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.TaskInclude;

const projectInclude = {
  members: { select: { userId: true } },
  sections: { orderBy: { position: "asc" as const } },
} satisfies Prisma.ProjectInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;
type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

function actorFrom(user: User): Actor {
  return publicUser(user);
}

export async function actorFromSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return actorFrom(session.user);
}

export async function actorFromApiKey(secret: string) {
  if (!secret.startsWith("asa_")) return null;
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: sha256(secret) },
    include: { user: true },
  });
  if (!key || !hashesEqual(key.keyHash, sha256(secret))) return null;
  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });
  return actorFrom(key.user);
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

function assertWritable(actor: Actor) {
  if (actor.access === "leitura") {
    throw new ApiError(403, "Sua conta está em modo leitura.");
  }
}

function assertAdmin(actor: Actor) {
  if (actor.access !== "admin") {
    throw new ApiError(403, "Só um administrador pode fazer isso.");
  }
}

async function memberProjectIds(userId: string) {
  const rows = await prisma.projectMember.findMany({
    where: { userId },
    select: { projectId: true },
  });
  return rows.map((row) => row.projectId);
}

function taskFilter(actor: Actor, projectIds: string[]): Prisma.TaskWhereInput {
  if (actor.access === "admin") return { projectId: { in: projectIds } };
  return { projectId: { in: projectIds }, assigneeId: actor.id };
}

async function loadTask(id: string) {
  return prisma.task.findUnique({ where: { id }, include: taskInclude });
}

async function visibleTask(actor: Actor, id: string) {
  const task = await loadTask(id);
  if (!task) throw new ApiError(404, "Tarefa não encontrada.");
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: task.projectId, userId: actor.id } },
  });
  if (!member) throw new ApiError(404, "Tarefa não encontrada.");
  if (actor.access !== "admin" && task.assigneeId !== actor.id) {
    throw new ApiError(404, "Tarefa não encontrada.");
  }
  return task;
}

async function visibleProject(actor: Actor, id: string) {
  const project = await prisma.project.findUnique({ where: { id }, include: projectInclude });
  if (!project || !project.members.some((member) => member.userId === actor.id)) {
    throw new ApiError(404, "Projeto não encontrado.");
  }
  return project;
}

async function notify(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  href?: string | null;
}) {
  if (!input.userId) return;
  await prisma.notification.create({
    data: {
      id: uid("ntf"),
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
    },
  });
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
  if (taken) throw new ApiError(400, "Este e-mail já está em uso.");
  const user = await prisma.user.create({
    data: {
      id: uid("u"),
      name,
      email,
      passwordHash: await bcrypt.hash(input.password, 10),
      initials: initialsFrom(name),
      role: "Membro",
      access: "editor",
    },
  });
  const token = await createSession(user.id);
  return { token, user: actorFrom(user) };
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
  return { token, user: actorFrom(user) };
}

export async function requestReset(email: string) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) throw new ApiError(400, "Não encontramos uma conta com este e-mail.");
  const token = randomToken();
  await prisma.resetToken.create({
    data: {
      id: uid("rst"),
      tokenHash: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return { token };
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
  if (actor.access === "admin") return null;
  const projectIds = await memberProjectIds(actor.id);
  const members = await prisma.projectMember.findMany({
    where: { projectId: { in: projectIds } },
    select: { userId: true },
  });
  return [...new Set([actor.id, ...members.map((member) => member.userId)])];
}

export async function listUsers(actor: Actor) {
  const ids = await visibleUserIds(actor);
  const users = await prisma.user.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    orderBy: { name: "asc" },
  });
  return users.map(publicUser);
}

export async function listTeam(actor: Actor) {
  assertAdmin(actor);
  return listUsers(actor);
}

export async function updateUser(
  actor: Actor,
  id: string,
  patch: {
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
  if (current.master && actor.id !== current.id) {
    throw new ApiError(403, "A conta principal só pode ser editada por ela mesma.");
  }
  if (actor.access !== "admin" && actor.id !== current.id) {
    throw new ApiError(403, "Você não pode editar este perfil.");
  }

  const name = patch.name !== undefined ? patch.name.trim() : current.name;
  if (!name) throw new ApiError(400, "Informe o nome.");
  const email = (patch.email !== undefined ? patch.email : current.email).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError(400, "Informe um e-mail válido.");
  const taken = await prisma.user.findFirst({ where: { email, NOT: { id } } });
  if (taken) throw new ApiError(400, "Este e-mail já está em uso.");
  const role = (patch.role !== undefined ? patch.role : current.role).trim();
  if (!role) throw new ApiError(400, "Informe o cargo.");

  let access = current.access;
  if (current.master) {
    access = "admin";
  } else if (patch.access && actor.access === "admin") {
    access = patch.access;
  }
  if (!current.master && current.access === "admin" && access !== "admin") {
    const others = await prisma.user.count({
      where: { id: { not: id }, access: "admin" },
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
      name,
      email,
      role,
      access,
      passwordHash,
      initials: initialsFrom(name),
      avatar: patch.avatar === undefined ? current.avatar : patch.avatar,
    },
  });
  return publicUser(user);
}

export async function addMember(
  actor: Actor,
  input: { name: string; email: string; password: string; role: string; access: Actor["access"] },
) {
  assertAdmin(actor);
  const name = input.name.trim();
  const role = input.role.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) throw new ApiError(400, "Informe o nome.");
  if (!role) throw new ApiError(400, "Informe o cargo.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError(400, "Informe um e-mail válido.");
  if (input.password.length < 6) {
    throw new ApiError(400, "A senha precisa ter pelo menos 6 caracteres.");
  }
  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken) throw new ApiError(400, "Este e-mail já está em uso.");
  const user = await prisma.user.create({
    data: {
      id: uid("u"),
      name,
      email,
      passwordHash: await bcrypt.hash(input.password, 10),
      initials: initialsFrom(name),
      role,
      access: input.access,
    },
  });
  return publicUser(user);
}

async function loadProjects(actor: Actor) {
  const projectIds = await memberProjectIds(actor.id);
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
      createdAt: todayISO(),
      members: { create: { userId: actor.id } },
      sections: { create: { id: uid("sec"), name: "Geral", position: 0 } },
    },
    include: projectInclude,
  });
  return publicProject(project);
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

export async function addProjectMember(actor: Actor, projectId: string, userId: string) {
  assertAdmin(actor);
  const project = await visibleProject(actor, projectId);
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

async function loadTasks(actor: Actor) {
  const projectIds = await memberProjectIds(actor.id);
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
  },
) {
  assertAdmin(actor);
  const project = await visibleProject(actor, input.projectId);
  const title = input.title.trim();
  if (!title) throw new ApiError(400, "Informe o título.");
  const section = input.section?.trim() || project.sections[0]?.name || "Geral";
  if (!project.sections.some((item) => item.name === section)) {
    throw new ApiError(400, "Sessão não encontrada.");
  }
  const assigneeId = input.assigneeId === undefined ? actor.id : input.assigneeId;
  if (assigneeId) {
    const member = project.members.some((item) => item.userId === assigneeId);
    if (!member) throw new ApiError(400, "O responsável não participa deste projeto.");
  }
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
      description: input.description?.trim() ?? "",
      assigneeId,
      dueDate: input.dueDate ?? null,
      startDate: input.startDate ?? input.dueDate ?? null,
      priority: input.priority ?? "media",
      status: "todo",
      section,
      order: order + 1,
      createdAt: new Date().toISOString(),
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
    });
  }
  return publicTask(task);
}

const editorFields = new Set([
  "title",
  "description",
  "dueDate",
  "startDate",
  "priority",
  "status",
  "tagIds",
  "section",
  "order",
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
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;
  if (patch.startDate !== undefined) data.startDate = patch.startDate;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.order !== undefined) data.order = patch.order;
  if (patch.status !== undefined) {
    data.status = patch.status;
    data.completedAt = patch.status === "done" ? todayISO() : null;
  }
  if (patch.section !== undefined) {
    const project = await visibleProject(actor, task.projectId);
    if (!project.sections.some((section) => section.name === patch.section)) {
      throw new ApiError(400, "Sessão não encontrada.");
    }
    data.section = patch.section;
  }
  if (patch.assigneeId !== undefined && patch.assigneeId !== task.assigneeId) {
    assertAdmin(actor);
    if (patch.assigneeId) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: task.projectId, userId: patch.assigneeId } },
      });
      if (!member) throw new ApiError(400, "O responsável não participa deste projeto.");
    }
    data.assignee = patch.assigneeId
      ? { connect: { id: patch.assigneeId } }
      : { disconnect: true };
  }
  const next = await prisma.task.update({ where: { id }, data, include: taskInclude });
  if (patch.tagIds) {
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
    });
  }
  return publicTask(saved);
}

export async function addSubtask(actor: Actor, taskId: string, title: string) {
  assertWritable(actor);
  const parent = await visibleTask(actor, taskId);
  const trimmed = title.trim();
  if (!trimmed) throw new ApiError(400, "Informe o título.");
  const assigneeId = parent.assigneeId ?? actor.id;
  const task = await prisma.task.create({
    data: {
      id: uid("task"),
      projectId: parent.projectId,
      title: trimmed,
      description: "",
      assigneeId,
      dueDate: null,
      startDate: null,
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
  return publicTask(task);
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
  if (task.assigneeId && task.assigneeId !== actor.id) {
    await notify({
      userId: task.assigneeId,
      type: "comment",
      title: "Novo comentário",
      body: `${actor.name} comentou em “${task.title}”.`,
      href: `/projetos/${task.projectId}?task=${task.id}`,
    });
  }
  const saved = await loadTask(taskId);
  if (!saved) throw new ApiError(404, "Tarefa não encontrada.");
  return publicTask(saved);
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

export async function listTags() {
  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
  return tags.map(publicTag);
}

export async function createTag(actor: Actor, name: string, color: string) {
  assertAdmin(actor);
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) throw new ApiError(400, "Informe o nome da tag.");
  const tag = await prisma.tag.create({
    data: { id: uid("t"), name: trimmed, color },
  });
  return publicTag(tag);
}

export async function updateTag(
  actor: Actor,
  id: string,
  patch: { name?: string; color?: string },
) {
  assertAdmin(actor);
  const current = await prisma.tag.findUnique({ where: { id } });
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
  await prisma.tag.delete({ where: { id } }).catch(() => {
    throw new ApiError(404, "Tag não encontrada.");
  });
}

async function visibleThread(actor: Actor, id: string) {
  const thread = await prisma.thread.findUnique({
    where: { id },
    include: { participants: true },
  });
  if (!thread || !thread.participants.some((person) => person.userId === actor.id)) {
    throw new ApiError(404, "Conversa não encontrada.");
  }
  return thread;
}

export async function listThreads(actor: Actor) {
  const threads = await prisma.thread.findMany({
    where: { participants: { some: { userId: actor.id } } },
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
  const visible = await visibleUserIds(actor);
  const allowed = new Set(visible ?? []);
  if (!visible) {
    const everyone = await prisma.user.findMany({ select: { id: true } });
    for (const person of everyone) allowed.add(person.id);
  }
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
    orderBy: { createdAt: "desc" },
  });
  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
    createdAt: key.createdAt.toISOString(),
  }));
}

export async function createApiKey(actor: Actor, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new ApiError(400, "Informe um nome para a chave.");
  const secret = `asa_${randomToken()}`;
  const key = await prisma.apiKey.create({
    data: {
      id: uid("key"),
      userId: actor.id,
      name: trimmed,
      keyHash: sha256(secret),
      prefix: secret.slice(0, 12),
    },
  });
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    secret,
    createdAt: key.createdAt.toISOString(),
  };
}

export async function deleteApiKey(actor: Actor, id: string) {
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key || key.userId !== actor.id) throw new ApiError(404, "Chave não encontrada.");
  await prisma.apiKey.delete({ where: { id } });
}

export async function bootstrap(actor: Actor) {
  const [users, projects, tasks, tags, threads, messages, notifications] = await Promise.all([
    listUsers(actor),
    listProjects(actor),
    listTasks(actor),
    listTags(),
    listThreads(actor),
    listMessages(actor),
    listNotifications(actor),
  ]);
  return { user: actor, users, projects, tasks, tags, threads, messages, notifications };
}
