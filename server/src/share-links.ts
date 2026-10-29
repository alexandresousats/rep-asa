import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { Hono } from "hono";
import { z } from "zod";
import { workspaceIsEntitled } from "./billing";
import { sessionCookieSecure } from "./cookie";
import { randomToken, sha256, uid } from "./crypto";
import { prisma } from "./db";
import { notify, type Actor } from "./domain";
import { ApiError } from "./errors";
import { publish } from "./events";
import { sanitizeRichText } from "./html";
import { publicTask as internalTask } from "./serialize";
import { assertRateLimit, clientIp } from "./rate-limit";

const LINK_MISSING = "Link não encontrado.";
const PIN_REQUIRED = "Acesso não liberado.";
const PIN_REJECTED = "Não foi possível liberar o link.";
const SHARE_COOKIE = "asa_share";
const SHARE_TTL_SECONDS = 12 * 60 * 60;
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PIN_DIGITS = /^\d{4}$/;
const attachmentDir = path.join(process.cwd(), "server/data/attachments");
const SAFE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

const linkInput = z.object({
  label: z.string().max(80).optional(),
  expiresAt: z.string().nullable().optional(),
  visibility: z.enum(["public", "private"]).optional(),
  pin: z.string().optional(),
});

type LinkInput = z.infer<typeof linkInput>;

const feedbackInput = z.object({
  clientName: z.string().trim().min(1).max(80),
  clientEmail: z.union([z.literal(""), z.string().trim().email().max(200)]).optional(),
  message: z.string().max(2000).optional(),
});

type FeedbackInput = z.infer<typeof feedbackInput>;

type ShareLinkRow = {
  id: string;
  projectId: string;
  workspaceId: string;
  label: string;
  createdById: string;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastAccessAt: Date | null;
  accessCount: number;
  visibility: "public" | "private";
  pinHash: string | null;
  sessionVersion: number;
};

type Opened =
  | { state: "unavailable" }
  | { state: "locked"; workspaceId: string }
  | { state: "open"; link: ShareLinkRow };

export function isPublicSharePath(pathName: string) {
  return pathName === "/public/share" || pathName.startsWith("/public/share/");
}

// O navegador chega na API pelo proxy do Next em /api, então o cookie precisa desse prefixo.
function shareCookiePrefix() {
  return (process.env.SHARE_COOKIE_PATH_PREFIX ?? "/api").replace(/\/$/, "");
}

export function shareCookieOptions(token: string) {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: sessionCookieSecure(),
    path: `${shareCookiePrefix()}/public/share/${token}`,
    maxAge: SHARE_TTL_SECONDS,
  };
}

function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "Dados inválidos.");
  return result.data;
}

function assertShareAdmin(actor: Actor) {
  if (!actor.workspaceId) {
    throw new ApiError(403, "Aceite o convite para entrar num espaço de trabalho.");
  }
  if (actor.access !== "admin") {
    throw new ApiError(403, "Só um administrador pode fazer isso.");
  }
}

function assertPin(pin: string | undefined, required: boolean) {
  if (pin === undefined) {
    if (required) throw new ApiError(400, "O PIN precisa ter 4 dígitos.");
    return;
  }
  if (!PIN_DIGITS.test(pin)) throw new ApiError(400, "O PIN precisa ter 4 dígitos.");
}

function parseExpiry(value: string | null) {
  if (value === null) return null;
  if (value.length > 40) throw new ApiError(400, "Data de expiração inválida.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "Data de expiração inválida.");
  return date;
}

function shareSecret() {
  const dedicated = process.env.SHARE_LINK_SECRET?.trim() ?? "";
  const fallback = process.env.DEMAND_LINK_SECRET?.trim() ?? "";
  const secret = dedicated.length >= 32 ? dedicated : fallback;
  if (secret.length < 32) throw new ApiError(500, "Link temporariamente indisponível.");
  return secret;
}

function signShareSession(linkId: string, sessionVersion: number) {
  const payload = {
    linkId,
    v: sessionVersion,
    exp: Date.now() + SHARE_TTL_SECONDS * 1000,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", shareSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function sessionMatches(raw: string | undefined, linkId: string, sessionVersion: number) {
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 2) return false;
  const [data, sig] = parts;
  const expected = createHmac("sha256", shareSecret()).update(data).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return false;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as {
      linkId?: unknown;
      v?: unknown;
      exp?: unknown;
    };
    if (payload.linkId !== linkId || payload.v !== sessionVersion) return false;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

function adminLink(row: ShareLinkRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    label: row.label,
    visibility: row.visibility,
    hasPin: row.pinHash != null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    lastAccessAt: row.lastAccessAt?.toISOString() ?? null,
    accessCount: row.accessCount,
    createdById: row.createdById,
  };
}

function noteAccess(id: string) {
  void prisma.clientShareLink
    .update({
      where: { id },
      data: { accessCount: { increment: 1 }, lastAccessAt: new Date() },
    })
    .catch(() => {
      console.error("Não foi possível registrar o acesso ao link.");
    });
}

async function projectInWorkspace(actor: Actor, projectId: string) {
  assertShareAdmin(actor);
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: actor.workspaceId! },
    select: { id: true, workspaceId: true },
  });
  if (!project) throw new ApiError(404, "Projeto não encontrado.");
  return project;
}

async function adminLinkRow(actor: Actor, projectId: string, linkId: string) {
  assertShareAdmin(actor);
  const row = await prisma.clientShareLink.findFirst({
    where: { id: linkId, projectId, workspaceId: actor.workspaceId! },
  });
  if (!row) throw new ApiError(404, LINK_MISSING);
  return row;
}

export async function listShareLinks(actor: Actor, projectId: string) {
  await projectInWorkspace(actor, projectId);
  const rows = await prisma.clientShareLink.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(adminLink);
}

export async function createShareLink(actor: Actor, projectId: string, input: LinkInput) {
  const project = await projectInWorkspace(actor, projectId);
  const visibility = input.visibility ?? "public";
  assertPin(input.pin, visibility === "private");
  const token = randomToken();
  const row = await prisma.clientShareLink.create({
    data: {
      id: uid("share"),
      projectId: project.id,
      workspaceId: project.workspaceId,
      tokenHash: sha256(token),
      label: input.label?.trim().slice(0, 80) ?? "",
      createdById: actor.id,
      expiresAt: input.expiresAt === undefined ? null : parseExpiry(input.expiresAt),
      visibility,
      pinHash: input.pin ? await bcrypt.hash(input.pin, 10) : null,
    },
  });
  return { ...adminLink(row), token };
}

export async function updateShareLink(
  actor: Actor,
  projectId: string,
  linkId: string,
  input: LinkInput,
) {
  const current = await adminLinkRow(actor, projectId, linkId);
  assertPin(input.pin, false);
  const nextVisibility = input.visibility ?? current.visibility;
  const nextPin = input.pin ? await bcrypt.hash(input.pin, 10) : current.pinHash;
  if (nextVisibility === "private" && !nextPin) {
    throw new ApiError(400, "O PIN precisa ter 4 dígitos.");
  }
  const bump =
    input.pin !== undefined || (input.visibility === "private" && current.visibility !== "private");
  const row = await prisma.clientShareLink.update({
    where: { id: current.id },
    data: {
      label: input.label === undefined ? current.label : input.label.trim().slice(0, 80),
      expiresAt: input.expiresAt === undefined ? current.expiresAt : parseExpiry(input.expiresAt),
      visibility: nextVisibility,
      pinHash: nextPin,
      ...(bump ? { sessionVersion: { increment: 1 } } : {}),
    },
  });
  return adminLink(row);
}

export async function revokeShareLink(actor: Actor, projectId: string, linkId: string) {
  const current = await adminLinkRow(actor, projectId, linkId);
  if (current.revokedAt) return adminLink(current);
  const row = await prisma.clientShareLink.update({
    where: { id: current.id },
    data: { revokedAt: new Date() },
  });
  return adminLink(row);
}

export async function regenerateShareLink(actor: Actor, projectId: string, linkId: string) {
  const current = await adminLinkRow(actor, projectId, linkId);
  if (current.revokedAt) throw new ApiError(404, LINK_MISSING);
  const token = randomToken();
  const created = await prisma.$transaction(async (tx) => {
    await tx.clientShareLink.update({
      where: { id: current.id },
      data: { revokedAt: new Date() },
    });
    return tx.clientShareLink.create({
      data: {
        id: uid("share"),
        projectId: current.projectId,
        workspaceId: current.workspaceId,
        tokenHash: sha256(token),
        label: current.label,
        createdById: actor.id,
        expiresAt: current.expiresAt,
        visibility: current.visibility,
        pinHash: current.pinHash,
      },
    });
  });
  return { ...adminLink(created), token };
}

async function assertSharePublicRate(ip: string, token: string) {
  await assertRateLimit(`share:ip:${ip}`, 120, FIFTEEN_MINUTES);
  if (token.length >= 43 && token.length <= 128) {
    await assertRateLimit(`share:token:${sha256(token)}`, 240, FIFTEEN_MINUTES);
  }
}

async function resolveShareLink(token: string) {
  if (token.length < 43 || token.length > 128) return null;
  const row = await prisma.clientShareLink.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

async function openPublic(c: Context, token: string): Promise<Opened> {
  await assertSharePublicRate(clientIp(c), token);
  const link = await resolveShareLink(token);
  if (!link) throw new ApiError(404, LINK_MISSING);
  noteAccess(link.id);
  if (!(await workspaceIsEntitled(link.workspaceId))) return { state: "unavailable" };
  if (
    link.visibility === "private" &&
    !sessionMatches(getCookie(c, SHARE_COOKIE), link.id, link.sessionVersion)
  ) {
    return { state: "locked", workspaceId: link.workspaceId };
  }
  return { state: "open", link };
}

function unavailable(c: Context) {
  return c.json({ unavailable: true });
}

// A tela de PIN mostra só a marca do workspace; nada do projeto antes do PIN.
async function lockedOverview(c: Context, workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true, logo: true },
  });
  return c.json({
    requiresPin: true,
    workspace: { name: workspace?.name ?? "", logo: workspace?.logo ?? null },
  });
}

function lockedResponse(): never {
  throw new ApiError(401, PIN_REQUIRED);
}

const taskSelect = {
  id: true,
  title: true,
  description: true,
  startDate: true,
  dueDate: true,
  status: true,
  section: true,
  approvalStatus: true,
  isDemand: true,
  demandFormat: true,
  referenceUrls: true,
  tags: { select: { tag: { select: { name: true, color: true } } } },
  attachments: { select: { id: true, name: true, mime: true, size: true } },
  clientFeedback: {
    select: { kind: true, clientName: true, message: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  },
} as const;

type PublicTaskRow = {
  id: string;
  title: string;
  description: string;
  startDate: string | null;
  dueDate: string | null;
  status: "todo" | "doing" | "done";
  section: string;
  approvalStatus: "none" | "pending" | "approved" | "changes_requested";
  isDemand: boolean;
  demandFormat: string | null;
  referenceUrls: string | null;
  tags: { tag: { name: string; color: string } }[];
  attachments: { id: string; name: string; mime: string; size: number }[];
  clientFeedback?: {
    kind: "approved" | "changes_requested";
    clientName: string;
    message: string | null;
    createdAt: Date;
  }[];
};

export function toPublicTask(task: PublicTaskRow) {
  return {
    id: task.id,
    title: task.title,
    description: sanitizeRichText(task.description),
    startDate: task.startDate,
    dueDate: task.dueDate,
    status: task.status,
    section: task.section,
    approvalStatus: task.approvalStatus,
    isDemand: task.isDemand,
    demandFormat: task.demandFormat,
    referenceUrls: task.referenceUrls,
    tags: task.tags.map((item) => ({ name: item.tag.name, color: item.tag.color })),
    attachments: task.attachments.map((file) => ({
      id: file.id,
      name: file.name,
      mime: file.mime,
      size: file.size,
    })),
    // Só o histórico do próprio cliente, sem e-mail.
    clientFeedback: (task.clientFeedback ?? []).map((item) => ({
      kind: item.kind,
      clientName: item.clientName,
      message: item.message,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

// Tarefas sem data ficam fora de qualquer período; a página as mostra numa seção "Sem data".
function inRange(
  task: { startDate: string | null; dueDate: string | null },
  from?: string,
  to?: string,
  includeUndated = false,
) {
  const start = task.startDate ?? task.dueDate;
  const end = task.dueDate ?? task.startDate;
  if (!start || !end) return includeUndated || (!from && !to);
  if (!from && !to) return true;
  if (from && end < from) return false;
  if (to && start > to) return false;
  return true;
}

function readRange(c: Context) {
  const from = c.req.query("from")?.trim() || undefined;
  const to = c.req.query("to")?.trim() || undefined;
  if ((from && !DAY.test(from)) || (to && !DAY.test(to)) || (from && to && from > to)) {
    throw new ApiError(400, "Período inválido.");
  }
  return { from, to, includeUndated: c.req.query("includeUndated") === "1" };
}

async function publicOverview(link: ShareLinkRow) {
  const project = await prisma.project.findUnique({
    where: { id: link.projectId },
    select: { name: true, color: true, workspace: { select: { name: true, logo: true } } },
  });
  if (!project) throw new ApiError(404, LINK_MISSING);
  return {
    project: { name: project.name, color: project.color },
    workspace: { name: project.workspace.name, logo: project.workspace.logo },
  };
}

async function publicTasks(link: ShareLinkRow, from?: string, to?: string, includeUndated = false) {
  const rows = await prisma.task.findMany({
    where: { projectId: link.projectId, parentId: null },
    select: taskSelect,
  });
  return rows
    .filter((task) => inRange(task, from, to, includeUndated))
    .sort((a, b) => {
      const left = a.dueDate ?? "9999-99-99";
      const right = b.dueDate ?? "9999-99-99";
      if (left !== right) return left < right ? -1 : 1;
      return a.title.localeCompare(b.title, "pt");
    })
    .map(toPublicTask);
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function addDays(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function monthBounds(month: string) {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function percent(part: number, total: number) {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

// Os números saem da mesma seleção que /tasks usa para o mês, para baterem com a aba Calendário.
export async function publicSummary(link: ShareLinkRow, month: string, today: string) {
  const { from, to } = monthBounds(month);
  const tasks = await publicTasks(link, from, to);
  const done = tasks.filter((task) => task.status === "done").length;
  const pending = tasks.filter((task) => task.approvalStatus === "pending");
  const approved = tasks.filter((task) => task.approvalStatus === "approved").length;
  const changes = tasks.filter((task) => task.approvalStatus === "changes_requested").length;
  const weekEnd = addDays(today, 6);
  const upcoming = (await publicTasks(link, today, weekEnd))
    .filter((task) => {
      const due = task.dueDate ?? task.startDate;
      return Boolean(due) && due! >= today && due! <= weekEnd;
    })
    .slice(0, 8);
  const formats = new Map<string, number>();
  for (const task of tasks) {
    const name = task.demandFormat?.trim() || "Outros";
    formats.set(name, (formats.get(name) ?? 0) + 1);
  }
  return {
    month,
    totals: {
      total: tasks.length,
      done,
      pending: pending.length,
      approved,
      changes,
      donePercent: percent(done, tasks.length),
      approvedPercent: percent(approved, tasks.length),
    },
    upcoming,
    attention: pending,
    formats: [...formats.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt")),
  };
}

async function publicTask(link: ShareLinkRow, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId: link.projectId, parentId: null },
    select: taskSelect,
  });
  if (!task) throw new ApiError(404, "Tarefa não encontrada.");
  return toPublicTask(task);
}

// Texto puro: sem caracteres de controle, que poderiam bagunçar a exibição.
function plainText(value: string | undefined) {
  return (value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}

async function recordClientFeedback(
  link: ShareLinkRow,
  taskId: string,
  kind: "approved" | "changes_requested",
  input: FeedbackInput,
) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId: link.projectId, parentId: null },
    select: {
      id: true,
      title: true,
      projectId: true,
      assigneeId: true,
      followers: { select: { userId: true } },
    },
  });
  if (!task) throw new ApiError(404, "Tarefa não encontrada.");
  const message = plainText(input.message);
  if (kind === "changes_requested" && !message) {
    throw new ApiError(400, "Descreva o ajuste que você precisa.");
  }
  const clientName = plainText(input.clientName).slice(0, 80);
  if (!clientName) throw new ApiError(400, "Informe seu nome.");
  const clientEmail = input.clientEmail?.trim() || null;
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    await tx.clientFeedback.create({
      data: {
        id: uid("cfb"),
        taskId: task.id,
        shareLinkId: link.id,
        kind,
        clientName,
        clientEmail,
        message: message || null,
        createdAt: now,
      },
    });
    return tx.task.update({
      where: { id: task.id },
      data: {
        approvalStatus: kind,
        approvalFeedback: message || null,
        approvedAt: now.toISOString(),
        approvedById: null,
        approvedByClientName: clientName,
        updatedAt: now.toISOString(),
      },
      include: {
        tags: { select: { tagId: true } },
        comments: { orderBy: { createdAt: "asc" } },
        followers: { select: { userId: true } },
        attachments: { orderBy: { createdAt: "asc" } },
        clientFeedback: { orderBy: { createdAt: "asc" } },
      },
    });
  });

  publish({ workspaceId: link.workspaceId, kind: "task", task: internalTask(updated) });
  const recipients = new Set(
    [task.assigneeId, ...task.followers.map((item) => item.userId)].filter(
      (id): id is string => Boolean(id),
    ),
  );
  if (recipients.size === 0) recipients.add(link.createdById);
  const approved = kind === "approved";
  await Promise.all(
    [...recipients].map((userId) =>
      notify({
        userId,
        workspaceId: link.workspaceId,
        type: "task_approval",
        title: approved ? "Aprovado pelo cliente" : "Ajuste solicitado pelo cliente",
        body: approved
          ? `${clientName} aprovou “${task.title}” pelo link do cliente.`
          : `${clientName} pediu ajuste em “${task.title}”: ${message.slice(0, 280)}`,
        href: `/projetos/${task.projectId}?task=${task.id}`,
      }).catch(() => {
        console.error("Não foi possível notificar sobre a resposta do cliente.");
      }),
    ),
  );

  return publicTask(link, task.id);
}

async function assertShareWriteRate(ip: string, token: string) {
  await assertRateLimit(`share:write:ip:${ip}`, 20, FIFTEEN_MINUTES);
  await assertRateLimit(`share:write:token:${sha256(token)}`, 40, FIFTEEN_MINUTES);
}

async function publicAttachment(link: ShareLinkRow, taskId: string, attachmentId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId: link.projectId, parentId: null },
    select: { id: true },
  });
  if (!task) throw new ApiError(404, "Tarefa não encontrada.");
  const file = await prisma.attachment.findFirst({
    where: { id: attachmentId, taskId: task.id },
    select: { id: true, name: true, mime: true },
  });
  if (!file) throw new ApiError(404, "Arquivo não encontrado.");
  try {
    const bytes = await readFile(path.join(attachmentDir, file.id));
    return { ...file, bytes };
  } catch {
    throw new ApiError(404, "Arquivo não encontrado.");
  }
}

function sendFile(
  c: Context,
  file: { name: string; mime: string; bytes: Buffer },
  disposition: "inline" | "attachment",
) {
  const name = file.name.replace(/["\r\n]/g, "");
  const mime = file.mime.toLowerCase().split(";")[0].trim();
  const safe = SAFE_MIME.has(mime);
  const inline = disposition === "inline" && safe;
  const bytes = new Uint8Array(file.bytes.byteLength);
  bytes.set(file.bytes);
  return c.body(bytes, 200, {
    "content-type": safe ? mime : "application/octet-stream",
    "content-disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
    "x-content-type-options": "nosniff",
  });
}

async function readBody(c: Context) {
  try {
    return await c.req.json();
  } catch {
    throw new ApiError(400, "Dados inválidos.");
  }
}

export function registerShareRoutes(app: Hono, deps: { actorOf: (c: Context) => Promise<Actor> }) {
  app.use("/public/share/*", async (c, next) => {
    await next();
    c.header("X-Robots-Tag", "noindex, nofollow");
    c.header("Referrer-Policy", "no-referrer");
    if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
  });

  app.post("/projects/:projectId/share-links", async (c) => {
    const input = parse(linkInput, await readBody(c));
    return c.json(
      await createShareLink(await deps.actorOf(c), c.req.param("projectId"), input),
      201,
    );
  });

  app.get("/projects/:projectId/share-links", async (c) => {
    return c.json(await listShareLinks(await deps.actorOf(c), c.req.param("projectId")));
  });

  app.patch("/projects/:projectId/share-links/:linkId", async (c) => {
    const input = parse(linkInput, await readBody(c));
    return c.json(
      await updateShareLink(
        await deps.actorOf(c),
        c.req.param("projectId"),
        c.req.param("linkId"),
        input,
      ),
    );
  });

  app.post("/projects/:projectId/share-links/:linkId/revoke", async (c) => {
    return c.json(
      await revokeShareLink(await deps.actorOf(c), c.req.param("projectId"), c.req.param("linkId")),
    );
  });

  app.post("/projects/:projectId/share-links/:linkId/regenerate", async (c) => {
    return c.json(
      await regenerateShareLink(
        await deps.actorOf(c),
        c.req.param("projectId"),
        c.req.param("linkId"),
      ),
    );
  });

  app.post("/public/share/:token/unlock", async (c) => {
    const token = c.req.param("token");
    await assertSharePublicRate(clientIp(c), token);
    const link = await resolveShareLink(token);
    if (!link) throw new ApiError(404, LINK_MISSING);
    noteAccess(link.id);
    if (!(await workspaceIsEntitled(link.workspaceId))) return unavailable(c);
    if (link.visibility !== "private") throw new ApiError(400, "Este link não usa PIN.");
    const body = await readBody(c);
    const submitted =
      body && typeof body === "object" && "pin" in body ? (body as { pin: unknown }).pin : undefined;
    const pin = typeof submitted === "string" && PIN_DIGITS.test(submitted) ? submitted : null;
    let matches = false;
    if (pin && link.pinHash) {
      try {
        matches = await bcrypt.compare(pin, link.pinHash);
      } catch {
        matches = false;
      }
    }
    if (!matches) throw new ApiError(401, PIN_REJECTED);
    setCookie(c, SHARE_COOKIE, signShareSession(link.id, link.sessionVersion), shareCookieOptions(token));
    return c.json({ ok: true });
  });

  app.get("/public/share/:token/tasks/:taskId/attachments/:attachmentId/preview", async (c) => {
    const opened = await openPublic(c, c.req.param("token"));
    if (opened.state === "unavailable") return unavailable(c);
    if (opened.state === "locked") return lockedResponse();
    const file = await publicAttachment(opened.link, c.req.param("taskId"), c.req.param("attachmentId"));
    return sendFile(c, file, "inline");
  });

  app.get("/public/share/:token/tasks/:taskId/attachments/:attachmentId", async (c) => {
    const opened = await openPublic(c, c.req.param("token"));
    if (opened.state === "unavailable") return unavailable(c);
    if (opened.state === "locked") return lockedResponse();
    const file = await publicAttachment(opened.link, c.req.param("taskId"), c.req.param("attachmentId"));
    return sendFile(c, file, "attachment");
  });

  for (const [action, kind] of [
    ["approve", "approved"],
    ["request-changes", "changes_requested"],
  ] as const) {
    app.post(`/public/share/:token/tasks/:taskId/${action}`, async (c) => {
      const token = c.req.param("token");
      const opened = await openPublic(c, token);
      if (opened.state === "unavailable") return unavailable(c);
      if (opened.state === "locked") return lockedResponse();
      await assertShareWriteRate(clientIp(c), token);
      const input = parse(feedbackInput, await readBody(c));
      return c.json(await recordClientFeedback(opened.link, c.req.param("taskId"), kind, input));
    });
  }

  app.get("/public/share/:token/summary", async (c) => {
    const opened = await openPublic(c, c.req.param("token"));
    if (opened.state === "unavailable") return unavailable(c);
    if (opened.state === "locked") return lockedResponse();
    const month = c.req.query("month")?.trim() ?? "";
    const today = c.req.query("today")?.trim() || new Date().toISOString().slice(0, 10);
    if (!MONTH.test(month) || !DAY.test(today)) throw new ApiError(400, "Período inválido.");
    return c.json(await publicSummary(opened.link, month, today));
  });

  app.get("/public/share/:token/tasks/:taskId", async (c) => {
    const opened = await openPublic(c, c.req.param("token"));
    if (opened.state === "unavailable") return unavailable(c);
    if (opened.state === "locked") return lockedResponse();
    return c.json(await publicTask(opened.link, c.req.param("taskId")));
  });

  app.get("/public/share/:token/tasks", async (c) => {
    const opened = await openPublic(c, c.req.param("token"));
    if (opened.state === "unavailable") return unavailable(c);
    if (opened.state === "locked") return lockedResponse();
    const range = readRange(c);
    return c.json({
      tasks: await publicTasks(opened.link, range.from, range.to, range.includeUndated),
    });
  });

  app.get("/public/share/:token", async (c) => {
    const opened = await openPublic(c, c.req.param("token"));
    if (opened.state === "unavailable") return unavailable(c);
    if (opened.state === "locked") return lockedOverview(c, opened.workspaceId);
    return c.json(await publicOverview(opened.link));
  });
}
