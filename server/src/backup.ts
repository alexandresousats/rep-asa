import type { Prisma } from "@prisma/client";
import {
  csvFileName,
  fold,
  formatAsanaDate,
  htmlToNotes,
  linkCsvTasks,
  notesToHtml,
  parseAsanaCsv,
  tasksToAsanaCsv,
  type CsvExportTask,
  type CsvPriority,
  type CsvStatus,
  type CsvTask,
  type ParsedAsanaCsv,
} from "./asana-csv";
import { todayISO, uid } from "./crypto";
import { prisma } from "./db";
import type { Actor } from "./domain";
import { ApiError } from "./errors";
import { sanitizeRichText } from "./html";

const MAX_BYTES = 5_000_000;
const MAX_TASKS = 8_000;
const COLORS = ["#a78bfa", "#34d399", "#60a5fa", "#f97316", "#f472b6", "#facc15"];
const TAG_COLORS = ["#a78bfa", "#34d399", "#60a5fa", "#f97316", "#f472b6", "#facc15", "#38bdf8", "#fb7185"];

export type CsvImportReport = {
  tasks: number;
  created: number;
  updated: number;
  skipped: number;
  projectsCreated: string[];
  warnings: string[];
};

type ExistingTask = {
  id: string;
  externalId: string | null;
  projectId: string;
  title: string;
  status: CsvStatus;
  completedAt: string | null;
  priority: CsvPriority;
  section: string;
  parentId: string | null;
  description: string;
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  customFields: Prisma.JsonValue | null;
  createdAt: string;
};

type ProjectState = {
  id: string;
  name: string;
  isNew: boolean;
  writable: boolean;
  defaultSection: string;
  sections: Map<string, string>;
  sectionNames: string[];
  nextPosition: number;
  memberIds: Set<string>;
};

type PlannedTask = {
  sourceIndex: number;
  rowNumber: number;
  dbId: string;
  isNew: boolean;
  replaced: boolean;
  projectId: string;
  section: string;
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
  startDate: string | null;
  priority: CsvPriority;
  status: CsvStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  externalId: string | null;
  customFields: Record<string, string> | null;
  tagNames: string[] | null;
  touchParent: boolean;
  parentId: string | null;
  moved: boolean;
  order: number;
  replaceDependencies: boolean;
  blockerIds: string[];
  blockingIds: string[];
};

export async function exportWorkspaceCsv(actor: Actor, projectId?: string) {
  const workspaceId = requireWorkspace(actor);
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });
  const memberships = await prisma.projectMember.findMany({
    where: { userId: actor.id, project: { workspaceId } },
    select: { projectId: true },
  });
  const visible = new Set(memberships.map((item) => item.projectId));
  if (projectId && !visible.has(projectId)) throw new ApiError(404, "Projeto não encontrado.");
  const projectIds = projectId ? [projectId] : [...visible];
  const tasks = projectIds.length
    ? await prisma.task.findMany({
        where: { projectId: { in: projectIds } },
        include: {
          tags: { include: { tag: { select: { name: true } } } },
          assignee: { select: { name: true, email: true } },
          project: { select: { name: true, sections: { select: { name: true, position: true } } } },
          parent: { select: { id: true, title: true, externalId: true } },
          blockedByEdges: {
            select: { blocker: { select: { id: true, title: true, externalId: true } } },
          },
          blockingEdges: {
            select: { blocked: { select: { id: true, title: true, externalId: true } } },
          },
        },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      })
    : [];

  const titleCounts = new Map<string, number>();
  for (const task of tasks) titleCounts.set(task.title, (titleCounts.get(task.title) ?? 0) + 1);

  const sortable = tasks.map((task) => {
    const section = task.project.sections.find((item) => item.name === task.section);
    return {
      task,
      id: task.id,
      parentId: task.parentId,
      blockerIds: task.blockedByEdges.map((edge) => edge.blocker.id),
      projectName: task.project.name,
      sectionPosition: section?.position ?? 999,
      order: task.order,
      createdAt: task.createdAt,
    };
  });
  const ordered = sortForAsana(sortable);
  const rows: CsvExportTask[] = ordered.map(({ task }) => ({
    taskId: task.externalId || task.id,
    createdAt: formatAsanaDate(task.createdAt),
    completedAt: task.status === "done" ? formatAsanaDate(task.completedAt || task.updatedAt || task.createdAt) : "",
    lastModified: formatAsanaDate(task.updatedAt || task.createdAt),
    name: task.title,
    section: task.section,
    assignee: task.assignee?.name ?? "",
    assigneeEmail: task.assignee?.email ?? "",
    startDate: formatAsanaDate(task.startDate),
    dueDate: formatAsanaDate(task.dueDate),
    tags: task.tags
      .map((item) => item.tag.name)
      .sort((a, b) => a.localeCompare(b, "pt-BR"))
      .join(", "),
    notes: htmlToNotes(task.description),
    projects: task.project.name,
    parent: task.parent ? refLabel(task.parent, titleCounts) : "",
    blockedBy: task.blockedByEdges.map((edge) => refLabel(edge.blocker, titleCounts)).join(", "),
    blocking: task.blockingEdges.map((edge) => refLabel(edge.blocked, titleCounts)).join(", "),
    priority: task.priority,
    status: task.status,
    customFields: readCustomFields(task.customFields),
  }));

  const named = projectId
    ? await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } })
    : null;
  return {
    filename: csvFileName(named?.name || workspace?.name || "tarefas"),
    csv: tasksToAsanaCsv(rows),
  };
}

export async function previewWorkspaceCsv(actor: Actor, csv: string, projectId?: string) {
  assertCsv(csv);
  const planned = await planImport(actor, csv, projectId);
  return planned.report;
}

export async function importWorkspaceCsv(actor: Actor, csv: string, projectId?: string) {
  assertCsv(csv);
  requireImporter(actor);
  const { report, plans, projects, sections, tags, members, tagIds } = await planImport(
    actor,
    csv,
    projectId,
  );
  const active = plans.filter((plan) => !plan.replaced);
  if (active.length === 0) return report;

  const tagIdByName = new Map(tagIds);
  await prisma.$transaction(
    async (tx) => {
      const freshProjects = projects.filter((project) => project.isNew);
      for (let index = 0; index < freshProjects.length; index += 1) {
        const project = freshProjects[index];
        await tx.project.create({
          data: {
            id: project.id,
            name: project.name,
            description: "",
            color: COLORS[index % COLORS.length],
            ownerId: actor.id,
            workspaceId: actor.workspaceId!,
            createdAt: todayISO(),
            members: { create: { userId: actor.id } },
            sections: {
              create: project.sectionNames.map((name, position) => ({
                id: uid("sec"),
                name,
                position,
              })),
            },
          },
        });
      }
      if (sections.length) {
        await tx.section.createMany({ data: sections, skipDuplicates: true });
      }
      for (let index = 0; index < tags.length; index += 1) {
        const name = tags[index];
        const id = uid("t");
        tagIdByName.set(fold(name), id);
        await tx.tag.create({
          data: {
            id,
            name,
            color: TAG_COLORS[index % TAG_COLORS.length],
            workspaceId: actor.workspaceId!,
          },
        });
      }
      if (members.length) {
        await tx.projectMember.createMany({ data: members, skipDuplicates: true });
      }
      for (const plan of active) {
        const customFields = plan.customFields
          ? (plan.customFields as Prisma.InputJsonValue)
          : undefined;
        const tagCreate = plan.tagNames
          ?.map((name) => tagIdByName.get(fold(name)))
          .filter((id): id is string => Boolean(id))
          .map((tagId) => ({ tagId }));
        if (plan.isNew) {
          await tx.task.create({
            data: {
              id: plan.dbId,
              projectId: plan.projectId,
              title: plan.title,
              description: plan.description,
              assigneeId: plan.assigneeId,
              dueDate: plan.dueDate,
              startDate: plan.startDate,
              priority: plan.priority,
              status: plan.status,
              section: plan.section,
              order: plan.order,
              completedAt: plan.completedAt,
              createdAt: plan.createdAt,
              updatedAt: plan.updatedAt,
              externalId: plan.externalId,
              customFields,
              tags: tagCreate?.length ? { create: tagCreate } : undefined,
            },
          });
        } else {
          await tx.task.update({
            where: { id: plan.dbId },
            data: {
              projectId: plan.projectId,
              title: plan.title,
              description: plan.description,
              assigneeId: plan.assigneeId,
              dueDate: plan.dueDate,
              startDate: plan.startDate,
              priority: plan.priority,
              status: plan.status,
              section: plan.section,
              order: plan.order,
              completedAt: plan.completedAt,
              createdAt: plan.createdAt,
              updatedAt: plan.updatedAt,
              externalId: plan.externalId,
              ...(customFields ? { customFields } : {}),
            },
          });
          if (plan.tagNames) {
            await tx.taskTag.deleteMany({ where: { taskId: plan.dbId } });
            if (tagCreate?.length) {
              await tx.taskTag.createMany({
                data: tagCreate.map((item) => ({ taskId: plan.dbId, tagId: item.tagId })),
                skipDuplicates: true,
              });
            }
          }
        }
      }
      for (const plan of active) {
        if (!plan.touchParent) continue;
        await tx.task.update({
          where: { id: plan.dbId },
          data: { parentId: plan.parentId },
        });
      }
      const moved = active.filter((plan) => plan.moved);
      for (const plan of moved) {
        await tx.task.updateMany({
          where: {
            parentId: plan.dbId,
            projectId: { not: plan.projectId },
            id: { notIn: active.map((item) => item.dbId) },
          },
          data: { projectId: plan.projectId, section: plan.section },
        });
      }
      const replaceIds = active.filter((plan) => plan.replaceDependencies).map((plan) => plan.dbId);
      if (replaceIds.length) {
        await tx.taskDependency.deleteMany({
          where: { OR: [{ blockerId: { in: replaceIds } }, { blockedId: { in: replaceIds } }] },
        });
      }
      const edges = new Map<string, { blockerId: string; blockedId: string }>();
      for (const plan of active) {
        if (!plan.replaceDependencies) continue;
        for (const blockerId of plan.blockerIds) {
          if (blockerId !== plan.dbId) edges.set(`${blockerId}|${plan.dbId}`, { blockerId, blockedId: plan.dbId });
        }
        for (const blockedId of plan.blockingIds) {
          if (blockedId !== plan.dbId) edges.set(`${plan.dbId}|${blockedId}`, { blockerId: plan.dbId, blockedId });
        }
      }
      if (edges.size) {
        await tx.taskDependency.createMany({ data: [...edges.values()], skipDuplicates: true });
      }
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  return report;
}

async function planImport(actor: Actor, csv: string, projectId?: string) {
  requireImporter(actor);
  const workspaceId = actor.workspaceId!;
  const parsed = parseAsanaCsv(csv);
  if (!parsed.columns.name) {
    throw new ApiError(400, "O CSV precisa da coluna Name, como na exportação do Asana.");
  }
  if (parsed.tasks.length > MAX_TASKS) {
    throw new ApiError(400, `O CSV tem mais de ${MAX_TASKS} tarefas.`);
  }
  const warnings = createWarnings(parsed.warnings);
  const [projectRows, taskRows, people, tagRows] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId },
      include: {
        sections: { orderBy: { position: "asc" } },
        members: { select: { userId: true } },
      },
    }),
    prisma.task.findMany({
      where: { project: { workspaceId } },
      select: {
        id: true,
        externalId: true,
        projectId: true,
        title: true,
        status: true,
        completedAt: true,
        priority: true,
        section: true,
        parentId: true,
        description: true,
        startDate: true,
        dueDate: true,
        assigneeId: true,
        customFields: true,
        createdAt: true,
      },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId, status: "active" },
      select: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.tag.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
  ]);

  const projects: ProjectState[] = projectRows.map((project) => {
    const sections = new Map(project.sections.map((section) => [fold(section.name), section.name]));
    return {
      id: project.id,
      name: project.name,
      isNew: false,
      writable: project.members.some((member) => member.userId === actor.id),
      defaultSection: project.sections[0]?.name ?? "Geral",
      sections,
      sectionNames: project.sections.map((section) => section.name),
      nextPosition: project.sections.reduce((max, section) => Math.max(max, section.position), -1),
      memberIds: new Set(project.members.map((member) => member.userId)),
    };
  });
  const projectsByName = new Map<string, ProjectState>();
  for (const project of projects) {
    const key = fold(project.name);
    if (!projectsByName.has(key)) projectsByName.set(key, project);
  }
  const forced = projectId ? projects.find((project) => project.id === projectId) : undefined;
  if (projectId && (!forced || !forced.writable)) throw new ApiError(404, "Projeto não encontrado.");

  const existing = taskRows as ExistingTask[];
  const byId = new Map(existing.map((task) => [task.id, task]));
  const byExternal = new Map<string, ExistingTask>();
  for (const task of existing) {
    if (task.externalId && !byExternal.has(task.externalId)) byExternal.set(task.externalId, task);
  }
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const person of people) {
    byEmail.set(person.user.email.trim().toLowerCase(), person.user.id);
    const key = fold(person.user.name);
    byName.set(key, [...(byName.get(key) ?? []), person.user.id]);
  }
  const tagsByName = new Map(tagRows.map((tag) => [fold(tag.name), tag.id]));
  const knownTagIds = new Map(tagsByName);
  const tagsToCreate: string[] = [];
  const sectionsToCreate: { id: string; projectId: string; name: string; position: number }[] = [];
  const memberPairs: { projectId: string; userId: string }[] = [];
  const seenMembers = new Set<string>();

  const plans: PlannedTask[] = [];
  const byCsvId = new Map<string, PlannedTask>();
  const planByTaskIndex = new Map<number, PlannedTask>();
  const orderInSection = new Map<string, number>();
  const canCreate = actor.access === "admin";
  const now = new Date().toISOString();

  parsed.tasks.forEach((row, sourceIndex) => {
    const project = forced ?? takeProject(row, projectsByName, canCreate, warnings, projects);
    if (!project) return;
    const section = ensureSection(project, parsed.columns.section ? row.section : "", sectionsToCreate);
    const matched = matchExisting(row.taskId, byExternal, byId);
    if (matched && !projects.find((item) => item.id === matched.projectId)?.writable) {
      warnings.add(`Linha ${row.rowNumber}: o Task ID já existe num projeto que você não acessa.`);
      return;
    }
    let target = project;
    if (matched && matched.projectId !== project.id && !forced) {
      const home = projects.find((item) => item.id === matched.projectId);
      if (home?.writable) {
        warnings.add(`Linha ${row.rowNumber}: a tarefa permanece em ${home.name}.`);
        target = home;
      }
    }
    const finalSection =
      target.id === project.id
        ? section
        : ensureSection(target, parsed.columns.section ? row.section : "", sectionsToCreate);
    const assigneeId = resolveAssignee(row, parsed, matched, byEmail, byName, warnings);
    if (assigneeId && !target.memberIds.has(assigneeId)) {
      target.memberIds.add(assigneeId);
      const key = `${target.id}:${assigneeId}`;
      if (!seenMembers.has(key)) {
        seenMembers.add(key);
        memberPairs.push({ projectId: target.id, userId: assigneeId });
      }
    }
    for (const tag of parsed.columns.tags ? row.tags : []) {
      const key = fold(tag);
      if (!key || tagsByName.has(key)) continue;
      tagsByName.set(key, "new");
      tagsToCreate.push(tag);
    }
    const orderKey = `${target.id}:${finalSection}`;
    const order = orderInSection.get(orderKey) ?? 0;
    orderInSection.set(orderKey, order + 1);
    const status = resolveStatus(row, parsed, matched);
    const previous = row.taskId ? byCsvId.get(row.taskId) : undefined;
    if (previous) {
      previous.replaced = true;
      warnings.add(`Linha ${row.rowNumber}: Task ID repetido. Vale esta linha.`);
    }
    const plan: PlannedTask = {
      sourceIndex,
      rowNumber: row.rowNumber,
      dbId: previous?.dbId ?? matched?.id ?? uid("task"),
      isNew: previous ? previous.isNew : !matched,
      replaced: false,
      projectId: target.id,
      section: finalSection,
      title: row.name.trim(),
      description: parsed.columns.notes
        ? sanitizeRichText(notesToHtml(row.notes))
        : (matched?.description ?? ""),
      assigneeId: parsed.columns.assignee ? assigneeId : (matched?.assigneeId ?? null),
      dueDate: parsed.columns.dueDate ? row.dueDate : (matched?.dueDate ?? null),
      startDate: parsed.columns.startDate ? row.startDate : (matched?.startDate ?? null),
      priority: row.priority ?? matched?.priority ?? "media",
      status: status.status,
      completedAt: status.completedAt,
      createdAt:
        parsed.columns.createdAt && row.createdAt
          ? atNoon(row.createdAt)
          : (matched?.createdAt ?? now),
      updatedAt: row.lastModified ? atNoon(row.lastModified) : now,
      externalId: row.taskId || matched?.externalId || null,
      customFields: parsed.customFieldNames.length ? row.customFields : null,
      tagNames: parsed.columns.tags ? row.tags : null,
      touchParent: parsed.columns.parent,
      parentId: null,
      moved: Boolean(matched && matched.projectId !== target.id),
      order,
      replaceDependencies: parsed.columns.blockedBy || parsed.columns.blocking,
      blockerIds: [],
      blockingIds: [],
    };
    plans.push(plan);
    planByTaskIndex.set(sourceIndex, plan);
    if (row.taskId) byCsvId.set(row.taskId, plan);
  });

  const links = linkCsvTasks(parsed.tasks);
  const active = plans.filter((plan) => !plan.replaced);
  for (const plan of active) {
    const row = parsed.tasks[plan.sourceIndex];
    const link = links[plan.sourceIndex];
    if (plan.touchParent) {
      plan.parentId = row.parent
        ? resolveLinked(link?.parentIndex ?? null, row.parent, plan, "tarefa pai", planByTaskIndex, byCsvId, parsed.tasks, existing, warnings)
        : null;
    } else {
      plan.parentId = null;
    }
    if (plan.replaceDependencies) {
      plan.blockerIds = row.blockedBy.flatMap((token) => {
        const index = link?.blockedBy.find((item) => sameTask(parsed.tasks[item], token)) ?? null;
        const id = resolveLinked(index, token, plan, "dependência", planByTaskIndex, byCsvId, parsed.tasks, existing, warnings);
        return id ? [id] : [];
      });
      plan.blockingIds = row.blocking.flatMap((token) => {
        const index = link?.blocking.find((item) => sameTask(parsed.tasks[item], token)) ?? null;
        const id = resolveLinked(index, token, plan, "dependência", planByTaskIndex, byCsvId, parsed.tasks, existing, warnings);
        return id ? [id] : [];
      });
    }
  }
  clearCycles(active, existing, warnings);

  const kept = active.length;
  const created = active.filter((plan) => plan.isNew).length;
  return {
    report: {
      tasks: parsed.tasks.length,
      created,
      updated: kept - created,
      skipped: parsed.tasks.length - kept,
      projectsCreated: projects.filter((project) => project.isNew).map((project) => project.name),
      warnings: warnings.finish(),
    },
    plans,
    projects,
    sections: sectionsToCreate,
    tags: tagsToCreate,
    members: memberPairs,
    tagIds: knownTagIds,
  };
}

function takeProject(
  row: CsvTask,
  projectsByName: Map<string, ProjectState>,
  canCreate: boolean,
  warnings: WarningBucket,
  projects: ProjectState[],
): ProjectState | null {
  const cell = row.projectCell.trim();
  const whole = cell ? projectsByName.get(fold(cell)) : undefined;
  const names = whole ? [whole.name] : row.projects;
  if (names.length === 0) {
    warnings.add(`Linha ${row.rowNumber}: sem projeto na coluna Projects.`);
    return null;
  }
  if (!whole && names.length > 1) {
    warnings.add(`Linha ${row.rowNumber}: vários projetos; a tarefa fica em ${names[0]}.`);
  }
  const found = projectsByName.get(fold(names[0]));
  if (found) {
    if (!found.writable) {
      warnings.add(`Linha ${row.rowNumber}: você não participa do projeto ${found.name}.`);
      return null;
    }
    return found;
  }
  if (!canCreate) {
    warnings.add(
      `Linha ${row.rowNumber}: o projeto ${names[0]} não existe. Um administrador pode criá-lo na importação.`,
    );
    return null;
  }
  const created = createProjectState(names[0]);
  projects.push(created);
  projectsByName.set(fold(created.name), created);
  return created;
}

function createProjectState(name: string): ProjectState {
  return {
    id: uid("p"),
    name: name.trim(),
    isNew: true,
    writable: true,
    defaultSection: "Geral",
    sections: new Map([[fold("Geral"), "Geral"]]),
    sectionNames: ["Geral"],
    nextPosition: 0,
    memberIds: new Set(),
  };
}

function ensureSection(
  project: ProjectState,
  requested: string,
  created: { id: string; projectId: string; name: string; position: number }[],
): string {
  const name = requested.trim() || project.defaultSection;
  const key = fold(name);
  const existing = project.sections.get(key);
  if (existing) return existing;
  project.sections.set(key, name);
  if (project.isNew) {
    project.sectionNames.push(name);
  } else {
    project.nextPosition += 1;
    created.push({ id: uid("sec"), projectId: project.id, name, position: project.nextPosition });
  }
  return name;
}

function resolveAssignee(
  row: CsvTask,
  parsed: ParsedAsanaCsv,
  matched: ExistingTask | null,
  byEmail: Map<string, string>,
  byName: Map<string, string[]>,
  warnings: WarningBucket,
): string | null {
  if (!parsed.columns.assignee) return matched?.assigneeId ?? null;
  const email = (row.assigneeEmail || (row.assignee.includes("@") ? row.assignee : "")).trim().toLowerCase();
  if (email && byEmail.has(email)) return byEmail.get(email)!;
  const name = row.assignee.includes("@") ? "" : row.assignee.trim();
  if (!email && !name) return null;
  const hits = name ? (byName.get(fold(name)) ?? []) : [];
  if (hits.length === 1) return hits[0];
  const label = row.assigneeEmail || row.assignee;
  warnings.add(
    hits.length > 1
      ? `Linha ${row.rowNumber}: há mais de uma pessoa chamada ${label}. A tarefa fica sem responsável.`
      : `Linha ${row.rowNumber}: responsável ${label} não está no espaço. A tarefa fica sem responsável.`,
  );
  return null;
}

function resolveStatus(
  row: CsvTask,
  parsed: ParsedAsanaCsv,
  existing: ExistingTask | null,
): { status: CsvStatus; completedAt: string | null } {
  if (row.completedAt) return { status: "done", completedAt: row.completedAt };
  if (row.status) {
    return {
      status: row.status,
      completedAt:
        row.status === "done"
          ? (existing?.completedAt ?? row.lastModified ?? row.createdAt ?? todayISO())
          : null,
    };
  }
  if (!existing) return { status: "todo", completedAt: null };
  if (parsed.columns.completedAt && existing.status === "done" && !parsed.columns.status) {
    return { status: "todo", completedAt: null };
  }
  return { status: existing.status, completedAt: existing.completedAt };
}

function resolveLinked(
  index: number | null,
  token: string,
  plan: PlannedTask,
  label: string,
  planByTaskIndex: Map<number, PlannedTask>,
  byCsvId: Map<string, PlannedTask>,
  tasks: CsvTask[],
  existing: ExistingTask[],
  warnings: WarningBucket,
): string | null {
  if (index !== null) {
    const linked = planByTaskIndex.get(index);
    const taskId = tasks[index]?.taskId;
    const chosen =
      linked && !linked.replaced ? linked : taskId ? byCsvId.get(taskId) : undefined;
    if (!chosen || chosen.replaced) {
      warnings.add(`Linha ${plan.rowNumber}: a ${label} "${clip(token)}" não pôde ser ligada.`);
      return null;
    }
    if (chosen.projectId !== plan.projectId) {
      warnings.add(`Linha ${plan.rowNumber}: a ${label} "${clip(token)}" está em outro projeto.`);
      return null;
    }
    return chosen.dbId;
  }
  const byKey = existing.find((task) => task.projectId === plan.projectId && (task.externalId === token || task.id === token));
  if (byKey) return byKey.id;
  const hits = existing.filter(
    (task) => task.projectId === plan.projectId && (task.title === token || fold(task.title) === fold(token)),
  );
  if (hits.length === 1) return hits[0].id;
  warnings.add(
    hits.length > 1
      ? `Linha ${plan.rowNumber}: há mais de uma ${label} chamada "${clip(token)}".`
      : `Linha ${plan.rowNumber}: não encontrei a ${label} "${clip(token)}".`,
  );
  return null;
}

function sameTask(task: CsvTask | undefined, token: string): boolean {
  if (!task) return false;
  return task.taskId === token || task.name === token || fold(task.name) === fold(token);
}

function clearCycles(plans: PlannedTask[], existing: ExistingTask[], warnings: WarningBucket) {
  const parentOf = new Map<string, string | null>(existing.map((task) => [task.id, task.parentId]));
  for (const plan of plans) {
    if (plan.touchParent) parentOf.set(plan.dbId, plan.parentId);
  }
  for (const plan of plans) {
    if (!plan.touchParent || !plan.parentId) continue;
    if (plan.parentId === plan.dbId) {
      plan.parentId = null;
      parentOf.set(plan.dbId, null);
      warnings.add(`Linha ${plan.rowNumber}: a tarefa não pode ser pai dela mesma.`);
      continue;
    }
    let current: string | null = plan.parentId;
    const seen = new Set<string>([plan.dbId]);
    let cycle = false;
    while (current) {
      if (seen.has(current)) {
        cycle = true;
        break;
      }
      seen.add(current);
      current = parentOf.get(current) ?? null;
    }
    if (cycle) {
      plan.parentId = null;
      parentOf.set(plan.dbId, null);
      warnings.add(`Linha ${plan.rowNumber}: a tarefa pai formaria um ciclo e foi ignorada.`);
    }
  }
}

function matchExisting(
  taskId: string,
  byExternal: Map<string, ExistingTask>,
  byId: Map<string, ExistingTask>,
): ExistingTask | null {
  if (!taskId) return null;
  return byExternal.get(taskId) ?? byId.get(taskId) ?? null;
}

function readCustomFields(value: Prisma.JsonValue | null): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const fields: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") fields[key] = item;
    else if (item != null && typeof item !== "object") fields[key] = String(item);
  }
  return fields;
}

function refLabel(task: { id: string; title: string; externalId: string | null }, counts: Map<string, number>) {
  if (task.title.includes(",") || (counts.get(task.title) ?? 0) > 1) return task.externalId || task.id;
  return task.title;
}

function sortForAsana<
  T extends {
    id: string;
    parentId: string | null;
    blockerIds: string[];
    projectName: string;
    sectionPosition: number;
    order: number;
    createdAt: string;
  },
>(tasks: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const list = groups.get(task.projectName) ?? [];
    list.push(task);
    groups.set(task.projectName, list);
  }
  return [...groups.keys()]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .flatMap((name) => {
      const group = groups.get(name) ?? [];
      group.sort(
        (a, b) =>
          a.sectionPosition - b.sectionPosition || a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      );
      return topo(group);
    });
}

function topo<T extends { id: string; parentId: string | null; blockerIds: string[] }>(tasks: T[]): T[] {
  const index = new Map(tasks.map((task, position) => [task.id, position]));
  const incoming = new Map(tasks.map((task) => [task.id, 0]));
  const next = new Map<string, string[]>(tasks.map((task) => [task.id, []]));
  const link = (before: string | null, after: string) => {
    if (!before || before === after || !index.has(before) || !index.has(after)) return;
    next.get(before)?.push(after);
    incoming.set(after, (incoming.get(after) ?? 0) + 1);
  };
  for (const task of tasks) {
    link(task.parentId, task.id);
    for (const blockerId of task.blockerIds) link(blockerId, task.id);
  }
  const ready = tasks.filter((task) => incoming.get(task.id) === 0);
  const out: T[] = [];
  const placed = new Set<string>();
  while (ready.length) {
    ready.sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
    const current = ready.shift();
    if (!current || placed.has(current.id)) continue;
    placed.add(current.id);
    out.push(current);
    for (const id of next.get(current.id) ?? []) {
      incoming.set(id, (incoming.get(id) ?? 1) - 1);
      if ((incoming.get(id) ?? 0) === 0) {
        const task = tasks[index.get(id) ?? -1];
        if (task) ready.push(task);
      }
    }
  }
  for (const task of tasks) if (!placed.has(task.id)) out.push(task);
  return out;
}

function atNoon(day: string) {
  return `${day}T12:00:00.000Z`;
}

function clip(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 80 ? `${clean.slice(0, 77)}...` : clean;
}

type WarningBucket = {
  add: (message: string) => void;
  finish: () => string[];
};

function createWarnings(initial: string[]): WarningBucket {
  const warnings = initial.slice(0, 40);
  let extra = Math.max(0, initial.length - warnings.length);
  return {
    add(message: string) {
      if (warnings.length < 40) warnings.push(message);
      else extra += 1;
    },
    finish() {
      if (extra > 0) warnings.push(`E mais ${extra} avisos.`);
      return warnings;
    },
  };
}

function assertCsv(csv: string) {
  if (csv.length > MAX_BYTES) throw new ApiError(413, "O arquivo passa de 5 MB.");
  if (!csv.trim()) throw new ApiError(400, "O arquivo CSV está vazio.");
}

function requireWorkspace(actor: Actor) {
  if (!actor.workspaceId) {
    throw new ApiError(403, "Aceite o convite para entrar num espaço de trabalho.");
  }
  return actor.workspaceId;
}

function requireImporter(actor: Actor) {
  requireWorkspace(actor);
  if (actor.access !== "admin" && actor.access !== "editor") {
    throw new ApiError(403, "Só administrador ou editor pode importar.");
  }
}
