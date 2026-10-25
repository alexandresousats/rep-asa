import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./db";
import type { Actor } from "./domain";
import { notify } from "./domain";
import { publicTask } from "./serialize";
import { ApiError } from "./errors";
import { todayISO, uid } from "./crypto";
import { sanitizeRichText } from "./html";

const LEAKED_DEMAND_LINK_SECRET = "asa-demand-link-verified-secret-key-2026-secure-salt";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DEMAND_LINK_TTL_MS = 7 * DAY_MS;
const MAX_DEMAND_LINK_TTL_MS = 30 * DAY_MS;
const DEMAND_LINK_SKEW_MS = 2 * 60 * 1000;

export function demandLinkTtlMs(raw = process.env.DEMAND_LINK_TTL): number {
  if (raw == null || raw.trim() === "") return DEFAULT_DEMAND_LINK_TTL_MS;
  const match = /^(\d+)(s|m|h|d)?$/i.exec(raw.trim());
  if (!match) return DEFAULT_DEMAND_LINK_TTL_MS;
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) return DEFAULT_DEMAND_LINK_TTL_MS;
  const unit = (match[2] ?? "s").toLowerCase();
  const unitMs =
    unit === "d" ? DAY_MS : unit === "h" ? 60 * 60 * 1000 : unit === "m" ? 60 * 1000 : 1000;
  const ms = amount * unitMs;
  if (!Number.isSafeInteger(ms) || ms <= 0) return DEFAULT_DEMAND_LINK_TTL_MS;
  return Math.min(ms, MAX_DEMAND_LINK_TTL_MS);
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 8;
const MAX_BASE64_CHARS = 14_000_000;

export function assertDemandLinkSecret() {
  const secret = process.env.DEMAND_LINK_SECRET ?? "";
  if (secret.length < 32 || secret === LEAKED_DEMAND_LINK_SECRET) {
    throw new Error(
      "Defina DEMAND_LINK_SECRET com pelo menos 32 caracteres, diferente do segredo antigo.",
    );
  }
  return secret;
}

export interface DemandLinkPayload {
  wId: string;       // workspaceId
  pId: string;       // projectId
  adminId: string;   // admin user who verified the link
  adminName: string; // admin user name
  iat: number;       // issued at timestamp
  exp: number;       // expires at timestamp
}

export function signDemandLink(payload: DemandLinkPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", assertDemandLinkSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

const DANGEROUS_MIME = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/xml",
  "application/xml",
  "application/javascript",
  "text/javascript",
  "application/x-javascript",
]);

function safeAttachmentMime(name: string, type: string) {
  if (/\.(html?|svg|xhtml|js|mjs)$/i.test(name.trim())) {
    throw new ApiError(400, "Esse tipo de arquivo não é permitido.");
  }
  const mime = (type || "application/octet-stream").toLowerCase().split(";")[0].trim();
  if (DANGEROUS_MIME.has(mime) || /javascript|svg|html/.test(mime)) {
    throw new ApiError(400, "Esse tipo de arquivo não é permitido.");
  }
  return mime || "application/octet-stream";
}

function validDemandLinkTimes(payload: DemandLinkPayload) {
  if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) return false;
  const now = Date.now();
  if (payload.iat > now + DEMAND_LINK_SKEW_MS) return false;
  if (payload.exp <= now) return false;
  if (payload.exp < payload.iat) return false;
  if (payload.exp - payload.iat > demandLinkTtlMs() + DEMAND_LINK_SKEW_MS) return false;
  return true;
}

export function parseAndVerifyDemandLink(token: string): DemandLinkPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    const expectedSig = createHmac("sha256", assertDemandLinkSecret()).update(data).digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const jsonStr = Buffer.from(data, "base64url").toString("utf-8");
    const payload = JSON.parse(jsonStr) as DemandLinkPayload;
    if (!validDemandLinkTimes(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function generateDemandLinkToken(
  actor: Actor,
  projectId: string,
  agent?: AgentConfig,
) {
  if (actor.access !== "admin" && actor.access !== "editor") {
    throw new ApiError(403, "Apenas administradores ou editores podem gerar links verificados de demanda.");
  }

  if (!actor.workspaceId) {
    throw new ApiError(400, "Espaço de trabalho não selecionado.");
  }

  if (agent?.baseUrl?.trim() && agent.apiKey?.trim() && agent.model?.trim()) {
    try {
      await saveWorkspaceAgent(actor, agent);
    } catch (error) {
      console.error("Não foi possível sincronizar o agente do espaço:", error);
    }
  }

  const workspaceId: string = actor.workspaceId;

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    include: { workspace: true },
  });

  if (!project) {
    throw new ApiError(404, "Projeto não encontrado neste espaço de trabalho.");
  }

  const issuedAt = Date.now();
  const payload: DemandLinkPayload = {
    wId: project.workspaceId,
    pId: project.id,
    adminId: actor.id,
    adminName: actor.name,
    iat: issuedAt,
    exp: issuedAt + demandLinkTtlMs(),
  };

  const token = signDemandLink(payload);

  return {
    token,
    project: {
      id: project.id,
      name: project.name,
      color: project.color,
      description: project.description,
    },
    workspace: {
      id: project.workspace.id,
      name: project.workspace.name,
    },
    verifiedBy: {
      id: actor.id,
      name: actor.name,
      role: actor.role || "Administrador",
      verified: true,
    },
  };
}

export async function verifyDemandLinkToken(token: string) {
  const payload = parseAndVerifyDemandLink(token);
  if (!payload) {
    throw new ApiError(400, "Link de demanda inválido ou assinatura não reconhecida.");
  }

  const project = await prisma.project.findFirst({
    where: { id: payload.pId, workspaceId: payload.wId },
    include: {
      workspace: true,
    },
  });

  if (!project) {
    throw new ApiError(404, "Projeto vinculado ao link não foi encontrado ou foi excluído.");
  }

  const tags = await prisma.tag.findMany({
    where: { workspaceId: payload.wId },
    orderBy: { name: "asc" },
  });

  const admin = await prisma.user.findUnique({
    where: { id: payload.adminId },
    select: { id: true, name: true, role: true, avatar: true },
  });

  return {
    ok: true,
    project: {
      id: project.id,
      name: project.name,
      color: project.color,
      description: project.description,
    },
    workspace: {
      id: project.workspace.id,
      name: project.workspace.name,
    },
    verifiedBy: {
      id: admin?.id ?? payload.adminId,
      name: admin?.name ?? payload.adminName,
      role: admin?.role ?? "Administrador",
      verified: true,
      verifiedAt: new Date(payload.iat).toISOString(),
    },
    tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    formats: [
      {
        id: "card",
        label: "Card / Post",
        tagName: "Card",
        desc: "Post estático 1:1 ou 4:5",
        color: "text-sky-400",
        bgLight: "bg-sky-500/10",
        borderColor: "border-sky-500/40",
      },
      {
        id: "carrossel",
        label: "Carrossel",
        tagName: "Carrossel",
        desc: "Sequência de slides educativos ou de venda",
        color: "text-indigo-400",
        bgLight: "bg-indigo-500/10",
        borderColor: "border-indigo-500/40",
      },
      {
        id: "video_longo",
        label: "Vídeo Longo",
        tagName: "Vídeo Longo",
        desc: "YouTube, aula, entrevista ou VSL",
        color: "text-amber-400",
        bgLight: "bg-amber-500/10",
        borderColor: "border-amber-500/40",
      },
      {
        id: "reels",
        label: "Reels / TikTok",
        tagName: "Reels",
        desc: "Vídeo vertical dinâmico 9:16",
        color: "text-pink-400",
        bgLight: "bg-pink-500/10",
        borderColor: "border-pink-500/40",
      },
    ],
  };
}

export interface SubmitDemandLinkInput {
  title: string;
  subject?: string;
  description: string;
  demandFormat?: string; // "card" | "carrossel" | "video_longo" | "reels"
  tagIds?: string[];
  dueDate?: string;
  referenceUrls?: string;
  requesterName?: string;
  requesterEmail?: string;
  attachments?: {
    name: string;
    type: string;
    size: number;
    base64?: string;
    url?: string;
  }[];
}

export async function submitDemandViaVerifiedLink(
  token: string,
  input: SubmitDemandLinkInput,
) {
  const payload = parseAndVerifyDemandLink(token);
  if (!payload) {
    throw new ApiError(400, "Link de demanda inválido ou expirado.");
  }

  const project = await prisma.project.findFirst({
    where: { id: payload.pId, workspaceId: payload.wId },
    include: {
      workspace: true,
      members: true,
    },
  });

  if (!project) {
    throw new ApiError(404, "Projeto não encontrado.");
  }

  // Encontra ou cria a seção "Demandas" no projeto
  let section = await prisma.section.findFirst({
    where: { projectId: project.id, name: "Demandas" },
  });
  if (!section) {
    const maxPos =
      (await prisma.section.aggregate({
        where: { projectId: project.id },
        _max: { position: true },
      }))._max.position ?? -1;

    section = await prisma.section.create({
      data: {
        id: uid("sec"),
        projectId: project.id,
        name: "Demandas",
        position: maxPos + 1,
      },
    });
  }

  const order =
    (await prisma.task.aggregate({
      where: { projectId: project.id, section: section.name, parentId: null },
      _max: { order: true },
    }))._max.order ?? -1;

  // Monta descrição formatada
  const requesterInfo = [
    input.requesterName ? `**Solicitante:** ${input.requesterName}` : null,
    input.requesterEmail ? `**Contato:** ${input.requesterEmail}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const formatLabels: Record<string, string> = {
    card: "Card / Post (1:1 / 4:5)",
    carrossel: "Carrossel",
    video_longo: "Vídeo Longo",
    reels: "Reels / TikTok (9:16)",
  };

  const formatText = input.demandFormat ? formatLabels[input.demandFormat] || input.demandFormat : null;

  const descParts: string[] = [];
  if (requesterInfo) descParts.push(requesterInfo);
  if (input.subject) descParts.push(`**Assunto:** ${input.subject}`);
  if (formatText) descParts.push(`**Formato:** ${formatText}`);
  if (input.description?.trim()) descParts.push(`\n**Briefing & Informações:**\n${input.description.trim()}`);
  if (input.referenceUrls?.trim()) descParts.push(`\n**Links & Referências:**\n${input.referenceUrls.trim()}`);

  const fullDescription = sanitizeRichText(descParts.join("\n\n"));

  // Garante tags do formato se existirem no workspace
  const tagIds = new Set(input.tagIds || []);
  if (input.demandFormat) {
    const formatTagName =
      input.demandFormat === "card"
        ? "Card"
        : input.demandFormat === "carrossel"
        ? "Carrossel"
        : input.demandFormat === "reels"
        ? "Reels"
        : "Vídeo Longo";

    const existingTag = await prisma.tag.findFirst({
      where: {
        workspaceId: project.workspaceId,
        name: { equals: formatTagName, mode: "insensitive" },
      },
    });
    if (existingTag) {
      tagIds.add(existingTag.id);
    }
  }

  const taskTitle =
    input.title?.trim() ||
    input.subject?.trim() ||
    `Demanda: ${formatText || "Conteúdo"}`;

  const incomingAttachments = (input.attachments ?? []).filter((item) => item.base64);
  if (incomingAttachments.length > MAX_ATTACHMENTS) {
    throw new ApiError(400, "Envie no máximo 8 arquivos.");
  }
  const preparedAttachments = incomingAttachments.map((item) => {
    const mime = safeAttachmentMime(item.name, item.type);
    const payload64 = item.base64 ?? "";
    if (payload64.length > MAX_BASE64_CHARS) {
      throw new ApiError(400, "O arquivo passa de 10 MB.");
    }
    const buffer = Buffer.from(payload64.replace(/^data:[^;]+;base64,/, ""), "base64");
    if (buffer.length <= 0) throw new ApiError(400, "Envie um arquivo.");
    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new ApiError(400, "O arquivo passa de 10 MB.");
    }
    return {
      name: item.name.trim().slice(0, 180) || "anexo",
      mime,
      buffer,
    };
  });

  const taskId = uid("task");

  const createdTask = await prisma.task.create({
    data: {
      id: taskId,
      projectId: project.id,
      title: taskTitle,
      description: fullDescription,
      dueDate: input.dueDate || null,
      startDate: input.dueDate || todayISO(),
      priority: "media",
      status: "todo",
      section: section.name,
      order: order + 1,
      createdAt: new Date().toISOString(),
      isDemand: true,
      demandFormat: input.demandFormat || null,
      referenceUrls: input.referenceUrls || null,
      approvalStatus: "pending",
      tags:
        tagIds.size > 0
          ? { create: Array.from(tagIds).map((tagId) => ({ tagId })) }
          : undefined,
    },
    include: {
      tags: { include: { tag: true } },
      attachments: true,
      comments: true,
      children: true,
    },
  });

  const attachmentDir = path.join(process.cwd(), "server/data/attachments");
  if (preparedAttachments.length > 0) {
    await mkdir(attachmentDir, { recursive: true });
    for (const item of preparedAttachments) {
      const fileId = uid("file");
      await writeFile(path.join(attachmentDir, fileId), item.buffer);
      await prisma.attachment.create({
        data: {
          id: fileId,
          taskId: createdTask.id,
          name: item.name,
          mime: item.mime,
          size: item.buffer.length,
        },
      });
    }
  }

  // Notifica o admin que verificou o link e o dono do projeto
  const notifyUserIds = new Set<string>();
  if (payload.adminId) notifyUserIds.add(payload.adminId);
  if (project.ownerId) notifyUserIds.add(project.ownerId);

  for (const userId of notifyUserIds) {
    try {
      await notify({
        userId,
        type: "demand_created",
        title: "Nova Demanda Recebida",
        body: `Demanda “${createdTask.title}” solicitada via Link Verificado no projeto ${project.name}.`,
        href: `/demandas?tab=demandas`,
        workspaceId: project.workspaceId,
      });
    } catch {
      // Notificação não bloqueia a criação
    }
  }

  const demandCode = `DEM-${createdTask.id.slice(-5).toUpperCase()}`;

  return {
    ok: true,
    task: publicTask(createdTask as any),
    demandCode,
    projectName: project.name,
    workspaceName: project.workspace.name,
  };
}

export type { DemandChatMessage, DemandExtractionState } from "./demand-types";
import type { DemandChatMessage, DemandExtractionState } from "./demand-types";
import { interpretDemandWithAgent } from "./demand-ai";
import { loadWorkspaceAgentForDemand, saveWorkspaceAgent } from "./workspace-agent";
import type { AgentConfig } from "./agent";

const FORMAT_LABELS: Record<string, string> = {
  card: "Card / Post",
  carrossel: "Carrossel",
  video_longo: "Vídeo Longo",
  reels: "Reels / TikTok",
};

function isAttachmentPlaceholder(text: string) {
  return text === "(Anexos enviados para a demanda)";
}

function extractFormatFromText(lower: string) {
  if (lower.includes("card") || lower.includes("post") || lower.includes("estático") || lower.includes("estatico")) {
    return "card";
  }
  if (lower.includes("carrossel") || lower.includes("slides") || lower.includes("carrosséis")) {
    return "carrossel";
  }
  if (
    lower.includes("vídeo longo") ||
    lower.includes("video longo") ||
    lower.includes("youtube") ||
    lower.includes("vsl") ||
    lower.includes("aula")
  ) {
    return "video_longo";
  }
  if (lower.includes("reels") || lower.includes("tiktok") || lower.includes("vertical") || lower.includes("shorts")) {
    return "reels";
  }
  return null;
}

const PT_MONTHS: Record<string, number> = {
  janeiro: 1,
  jan: 1,
  fevereiro: 2,
  fev: 2,
  marco: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  maio: 5,
  mai: 5,
  junho: 6,
  jun: 6,
  julho: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  setembro: 9,
  set: 9,
  outubro: 10,
  out: 10,
  novembro: 11,
  nov: 11,
  dezembro: 12,
  dez: 12,
};

function normalizePtToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function nextWeekday(today: Date, targetDay: number) {
  const d = new Date(today);
  const day = d.getDay();
  const diff = (targetDay - day + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function extractDueDateFromText(text: string, lower: string) {
  const today = new Date();
  const normalized = normalizePtToken(lower);

  if (/\bhoje\b/.test(normalized)) return todayISO();
  if (/\bamanha\b/.test(normalized)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  if (/\bdomingo\b/.test(normalized)) return nextWeekday(today, 0);
  if (/\bsegunda/.test(normalized)) return nextWeekday(today, 1);
  if (/\bterca\b/.test(normalized)) return nextWeekday(today, 2);
  if (/\bquarta\b/.test(normalized)) return nextWeekday(today, 3);
  if (/\bquinta\b/.test(normalized)) return nextWeekday(today, 4);
  if (/\bsexta\b/.test(normalized)) return nextWeekday(today, 5);
  if (/\bsabado\b/.test(normalized)) return nextWeekday(today, 6);

  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const matchSlash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (matchSlash) {
    const day = matchSlash[1].padStart(2, "0");
    const month = matchSlash[2].padStart(2, "0");
    const year = matchSlash[3]
      ? matchSlash[3].length === 2
        ? `20${matchSlash[3]}`
        : matchSlash[3]
      : String(today.getFullYear());
    return `${year}-${month}-${day}`;
  }

  const written = normalized.match(
    /(?:dia\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?/,
  );
  if (written) {
    const day = written[1].padStart(2, "0");
    const monthNum = PT_MONTHS[written[2]];
    if (monthNum) {
      const year = written[3] || String(today.getFullYear());
      return `${year}-${String(monthNum).padStart(2, "0")}-${day}`;
    }
  }

  const dayOnly = normalized.match(/\bdia\s+(\d{1,2})\b/);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    if (day >= 1 && day <= 31) {
      const month = today.getMonth() + 1;
      const year = today.getFullYear();
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

function formatDueDateLabel(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function buildReviewMessage(state: DemandExtractionState, projectName: string) {
  const fmt = state.format ? FORMAT_LABELS[state.format] || state.format : "—";
  const lines = [
    "Resumo da sua demanda:",
    "",
    `Assunto: ${state.subject}`,
    `Formato: ${fmt}`,
    `Prazo: ${state.dueDate ? formatDueDateLabel(state.dueDate) : "—"}`,
    `Projeto: ${projectName}`,
  ];
  if (state.notes?.trim()) {
    lines.push("", "Detalhes e briefing:", state.notes.trim());
  }
  if (state.referenceUrls?.trim()) {
    lines.push("", "Referências:", state.referenceUrls.trim());
  }
  lines.push(
    "",
    'Se estiver tudo certo, responda "sim" para enviar. Se quiser mudar algo, diga o que ajustar (assunto, formato ou prazo).',
  );
  return lines.join("\n");
}

function userConfirmed(lower: string) {
  const clean = lower
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[.!?…,"'"]/g, "")
    .trim();
  return /^(sim|confirmo|confirmar|pode enviar|enviar|ok|esta certo|tudo certo|manda|mandar|yes|y)$/i.test(
    clean,
  );
}

function demandIsComplete(state: DemandExtractionState) {
  return Boolean(state.subject?.trim() && state.format && state.dueDate);
}

function submitDemandResult(
  state: DemandExtractionState,
  verified: Awaited<ReturnType<typeof verifyDemandLinkToken>>,
) {
  syncFormatTag(state, verified.tags);
  return {
    ok: true,
    reply: "Perfeito. Estou registrando sua demanda agora.",
    updatedDemand: state,
    uiAction: undefined as undefined,
    submitRequested: true,
    project: verified.project,
    verifiedBy: verified.verifiedBy,
  };
}

function syncFormatTag(state: DemandExtractionState, tags: { id: string; name: string }[]) {
  if (!state.format || tags.length === 0) return;
  const formatTagName =
    state.format === "card"
      ? "Card"
      : state.format === "carrossel"
        ? "Carrossel"
        : state.format === "reels"
          ? "Reels"
          : "Vídeo Longo";
  const tag = tags.find((t) => t.name.toLowerCase() === formatTagName.toLowerCase());
  if (tag) state.tagIds = [tag.id];
}

export async function processDemandChatTurn(
  token: string,
  messages: DemandChatMessage[],
  currentState: DemandExtractionState = {},
) {
  const verified = await verifyDemandLinkToken(token);
  const project = verified.project;
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

  const state: DemandExtractionState = { ...currentState };
  const text = (lastUserMsg?.content || "").trim();
  const lower = text.toLowerCase();
  const hasImages = (lastUserMsg?.images?.length || 0) > 0;
  const hasVideos = (lastUserMsg?.videos?.length || 0) > 0;
  const hasDocs = (lastUserMsg?.documents?.length || 0) > 0;
  const hasAttachments = hasImages || hasVideos || hasDocs;
  const meaningfulText = text.length > 0 && !isAttachmentPlaceholder(text);

  let uiAction: "formats" | "review" | undefined;
  let submitRequested = false;

  const confirmIntent = userConfirmed(lower);

  if (!state.format) {
    const fromText = extractFormatFromText(lower);
    if (fromText) state.format = fromText;
  }

  const parsedDate = extractDueDateFromText(text, lower);
  if (parsedDate) state.dueDate = parsedDate;

  const urlMatches = text.match(/https?:\/\/[^\s]+/g);
  if (urlMatches && urlMatches.length > 0) {
    const currentUrls = state.referenceUrls ? state.referenceUrls.split("\n") : [];
    state.referenceUrls = Array.from(new Set([...currentUrls, ...urlMatches])).join("\n");
  }

  const agentConfig = await loadWorkspaceAgentForDemand(verified.workspace.id);
  if (agentConfig) {
    try {
      const ai = await interpretDemandWithAgent(agentConfig, messages, state);
      if (ai) {
        Object.assign(state, ai.state);
        if (ai.submitRequested && demandIsComplete(state) && meaningfulText) {
          return submitDemandResult(state, verified);
        }
      }
    } catch (error) {
      console.error("Falha ao interpretar demanda com agente:", error);
    }
  }

  if (meaningfulText && confirmIntent && demandIsComplete(state)) {
    return submitDemandResult(state, verified);
  }

  if (state.isReadyToConfirm && meaningfulText) {
    if (confirmIntent) {
      return submitDemandResult(state, verified);
    }

    if (lower.includes("assunto") || lower.includes("tema")) {
      const cleaned = text.replace(/^assunto:?\s*/i, "").trim();
      if (cleaned.length > 2) state.subject = cleaned;
    } else if (!parsedDate && extractFormatFromText(lower)) {
      state.format = extractFormatFromText(lower)!;
    } else if (parsedDate) {
      state.dueDate = parsedDate;
    } else if (text.length > 2) {
      state.notes = state.notes ? `${state.notes}\n${text}` : text;
    }
    state.isReadyToConfirm = true;
    syncFormatTag(state, verified.tags);
    return {
      ok: true,
      reply: buildReviewMessage(state, project.name),
      updatedDemand: state,
      uiAction: "review",
      submitRequested: false,
      project: verified.project,
      verifiedBy: verified.verifiedBy,
    };
  }

  if (!state.subject && meaningfulText && !/^formato:/i.test(text)) {
    const onlyFormat = extractFormatFromText(lower);
    const stripped = text
      .replace(/\b(card|post|carrossel|reels|tiktok|vídeo longo|video longo)\b/gi, "")
      .trim();
    if (stripped.length > 2) {
      state.subject = stripped;
    } else if (!onlyFormat) {
      state.subject = text;
    }
  }

  if (state.subject && meaningfulText && !confirmIntent) {
    const dateOnlyMessage = Boolean(parsedDate) && normalizePtToken(lower).replace(/\s+/g, " ").length < 40;
    if (!state.notes && state.format && state.dueDate && !dateOnlyMessage) {
      state.notes = text;
    } else if (
      state.notes &&
      meaningfulText &&
      !parsedDate &&
      !extractFormatFromText(lower)
    ) {
      state.notes = `${state.notes}\n${text}`;
    }
  }

  syncFormatTag(state, verified.tags);

  const fileFeedback = [
    hasImages ? "Recebi sua imagem." : null,
    hasVideos ? "Recebi seu vídeo." : null,
    hasDocs ? "Recebi seu documento." : null,
  ]
    .filter(Boolean)
    .join(" ");

  let reply = "";

  if (!state.subject) {
    reply = [
      fileFeedback,
      hasAttachments
        ? "Recebi seus anexos. Qual é o assunto ou tema principal desta demanda?"
        : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (!reply) {
      reply = "Qual é o assunto ou tema principal da demanda?";
    }
  } else if (!state.format) {
    reply = [
      fileFeedback,
      `Anotei o assunto: "${state.subject}".`,
      "Qual formato você precisa? Escolha uma opção abaixo ou digite o nome do formato.",
    ]
      .filter(Boolean)
      .join("\n\n");
    uiAction = "formats";
  } else if (!state.dueDate) {
    const fmt = FORMAT_LABELS[state.format] || state.format;
    reply = [
      fileFeedback,
      `Formato ${fmt} para "${state.subject}".`,
      "Qual é o prazo de entrega? Pode ser uma data (ex.: 25/11, 25 de outubro ou dia 25 de outubro) ou algo como amanhã ou sexta-feira.",
      "Se quiser, já inclua briefing, referências ou anexos na mesma mensagem.",
    ]
      .filter(Boolean)
      .join("\n\n");
  } else {
    state.isReadyToConfirm = true;
    reply = [fileFeedback, buildReviewMessage(state, project.name)].filter(Boolean).join("\n\n");
    uiAction = "review";
  }

  return {
    ok: true,
    reply,
    updatedDemand: state,
    uiAction,
    submitRequested,
    project: verified.project,
    verifiedBy: verified.verifiedBy,
  };
}
