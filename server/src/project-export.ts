import type { Context, Hono } from "hono";
import { z } from "zod";
import { csvFileName } from "./asana-csv";
import { serializeCsv } from "./csv";
import { todayISO } from "./crypto";
import { prisma } from "./db";
import type { Actor } from "./domain";
import { ApiError } from "./errors";

const HEADER = [
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
];
const STATUS = { todo: "A fazer", doing: "Em andamento", done: "Concluída" } as const;
const PRIORITY = { baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente" } as const;
const APPROVAL = {
  none: "Nenhuma",
  pending: "Aguardando",
  approved: "Aprovado",
  changes_requested: "Ajuste solicitado",
} as const;
const FORMULA_START = /^[=+\-@\t\r]/;
const MAX_IDS = 10_000;

const exportBody = z.object({
  taskIds: z.array(z.string().min(1).max(200)).max(MAX_IDS).optional(),
});

function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

// Planilhas executam células que começam com = + - @; o apóstrofo vira texto.
export function neutralizeFormula(value: string) {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

function day(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

async function assertExporter(actor: Actor, projectId: string) {
  if (!actor.workspaceId) throw new ApiError(404, "Projeto não encontrado.");
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, workspaceId: true },
  });
  if (!project || project.workspaceId !== actor.workspaceId) {
    throw new ApiError(404, "Projeto não encontrado.");
  }
  if (actor.access === "cliente") throw new ApiError(403, "Sua conta não pode exportar tarefas.");
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: actor.id } },
  });
  if (!member) throw new ApiError(403, "Você não tem acesso a este projeto.");
  return project;
}

export async function exportProjectTasksCsv(actor: Actor, projectId: string, taskIds?: string[]) {
  const project = await assertExporter(actor, projectId);
  const only = taskIds?.length ? { id: { in: taskIds } } : {};
  const [sections, tasks] = await Promise.all([
    prisma.section.findMany({ where: { projectId }, select: { name: true, position: true } }),
    prisma.task.findMany({
      where: { projectId, ...only },
      include: {
        assignee: { select: { name: true } },
        parent: { select: { title: true } },
        tags: { include: { tag: { select: { name: true } } } },
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const position = new Map(sections.map((section) => [section.name, section.position]));
  const ordered = [...tasks].sort(
    (a, b) => (position.get(a.section) ?? 999) - (position.get(b.section) ?? 999),
  );

  const base = appUrl();
  const rows = ordered.map((task) =>
    [
      task.title,
      task.section,
      STATUS[task.status],
      task.assignee?.name ?? "",
      day(task.startDate),
      day(task.dueDate),
      PRIORITY[task.priority],
      task.tags
        .map((item) => item.tag.name)
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .join("; "),
      APPROVAL[task.approvalStatus],
      task.parentId ? "Subtarefa" : "Tarefa",
      task.parent?.title ?? "",
      task.status === "done" ? day(task.completedAt) : "",
      day(task.createdAt),
      `${base}/projetos/${encodeURIComponent(projectId)}?task=${encodeURIComponent(task.id)}`,
    ].map(neutralizeFormula),
  );

  const name = csvFileName(project.name).replace(/\.csv$/, "");
  return {
    filename: `${name}-tarefas-${todayISO().slice(0, 10)}.csv`,
    csv: serializeCsv([HEADER, ...rows], { quoteAll: true }),
  };
}

export function registerProjectExportRoutes(
  app: Hono,
  deps: { actorOf: (c: Context) => Promise<Actor> },
) {
  app.post("/projects/:projectId/export.csv", async (c) => {
    const actor = await deps.actorOf(c);
    const result = exportBody.safeParse(await c.req.json().catch(() => ({})));
    if (!result.success) throw new ApiError(400, "Dados inválidos.");
    const file = await exportProjectTasksCsv(actor, c.req.param("projectId"), result.data.taskIds);
    return c.body(file.csv, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "cache-control": "no-store",
    });
  });
}
