import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "./db";
import type { Actor } from "./domain";
import { notify } from "./domain";
import { publicTask } from "./serialize";
import { ApiError } from "./errors";
import { todayISO, uid } from "./crypto";

const DEMAND_LINK_SECRET =
  process.env.DEMAND_LINK_SECRET ||
  process.env.SESSION_SECRET ||
  "asa-demand-link-verified-secret-key-2026-secure-salt";

export interface DemandLinkPayload {
  wId: string;       // workspaceId
  pId: string;       // projectId
  adminId: string;   // admin user who verified the link
  adminName: string; // admin user name
  iat: number;       // issued at timestamp
}

export function signDemandLink(payload: DemandLinkPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", DEMAND_LINK_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function parseAndVerifyDemandLink(token: string): DemandLinkPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [data, sig] = parts;
    const expectedSig = createHmac("sha256", DEMAND_LINK_SECRET).update(data).digest("base64url");
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const jsonStr = Buffer.from(data, "base64url").toString("utf-8");
    return JSON.parse(jsonStr) as DemandLinkPayload;
  } catch {
    return null;
  }
}

export async function generateDemandLinkToken(actor: Actor, projectId: string) {
  if (actor.access !== "admin" && actor.access !== "editor") {
    throw new ApiError(403, "Apenas administradores ou editores podem gerar links verificados de demanda.");
  }

  if (!actor.workspaceId) {
    throw new ApiError(400, "Espaço de trabalho não selecionado.");
  }

  const workspaceId: string = actor.workspaceId;

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    include: { workspace: true },
  });

  if (!project) {
    throw new ApiError(404, "Projeto não encontrado neste espaço de trabalho.");
  }

  const payload: DemandLinkPayload = {
    wId: project.workspaceId,
    pId: project.id,
    adminId: actor.id,
    adminName: actor.name,
    iat: Date.now(),
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

  const fullDescription = descParts.join("\n\n");

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

  const taskId = uid("task");
  const taskTitle =
    input.title?.trim() ||
    input.subject?.trim() ||
    `Demanda: ${formatText || "Conteúdo"}`;

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

  // Salva anexos de arquivos/imagens/vídeos/documentos se fornecidos
  const attachmentDir = path.join(process.cwd(), "server/data/attachments");
  if (input.attachments && input.attachments.length > 0) {
    await mkdir(attachmentDir, { recursive: true });
    for (const item of input.attachments) {
      if (item.base64) {
        try {
          const cleanBase64 = item.base64.replace(/^data:[^;]+;base64,/, "");
          const buffer = Buffer.from(cleanBase64, "base64");
          const fileId = uid("file");
          await writeFile(path.join(attachmentDir, fileId), buffer);
          await prisma.attachment.create({
            data: {
              id: fileId,
              taskId: createdTask.id,
              name: item.name.slice(0, 180) || "anexo",
              mime: item.type || "application/octet-stream",
              size: buffer.length,
            },
          });
        } catch (err) {
          console.error("Erro ao salvar anexo da demanda:", err);
        }
      }
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

export interface DemandChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: string[];
  videos?: string[];
  documents?: { name: string; size: number; type?: string; text?: string }[];
}

export interface DemandExtractionState {
  subject?: string;
  format?: string;
  tagIds?: string[];
  dueDate?: string;
  referenceUrls?: string;
  notes?: string;
  requesterName?: string;
  isReadyToConfirm?: boolean;
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

  // 1. Extração de formato a partir de palavras-chave
  if (!state.format) {
    if (lower.includes("card") || lower.includes("post") || lower.includes("estático") || lower.includes("estatico")) {
      state.format = "card";
    } else if (lower.includes("carrossel") || lower.includes("slides") || lower.includes("carrosséis")) {
      state.format = "carrossel";
    } else if (lower.includes("vídeo longo") || lower.includes("video longo") || lower.includes("youtube") || lower.includes("vsl") || lower.includes("aula")) {
      state.format = "video_longo";
    } else if (lower.includes("reels") || lower.includes("tiktok") || lower.includes("vertical") || lower.includes("shorts")) {
      state.format = "reels";
    }
  }

  // 2. Extração de prazo/data
  if (!state.dueDate) {
    const today = new Date();
    if (lower.includes("hoje")) {
      state.dueDate = todayISO();
    } else if (lower.includes("amanhã") || lower.includes("amanha")) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      state.dueDate = d.toISOString().split("T")[0];
    } else if (lower.includes("sexta")) {
      const d = new Date(today);
      const day = d.getDay();
      const diff = (5 - day + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      state.dueDate = d.toISOString().split("T")[0];
    } else if (lower.includes("segunda")) {
      const d = new Date(today);
      const day = d.getDay();
      const diff = (1 - day + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      state.dueDate = d.toISOString().split("T")[0];
    } else {
      // Regex para datas como 25/11, 25/11/2026, 2026-11-25
      const matchSlash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
      if (matchSlash) {
        const day = matchSlash[1].padStart(2, "0");
        const month = matchSlash[2].padStart(2, "0");
        const year = matchSlash[3] ? (matchSlash[3].length === 2 ? `20${matchSlash[3]}` : matchSlash[3]) : String(today.getFullYear());
        state.dueDate = `${year}-${month}-${day}`;
      }
    }
  }

  // 3. Extração de URLs de referência
  const urlMatches = text.match(/https?:\/\/[^\s]+/g);
  if (urlMatches && urlMatches.length > 0) {
    const currentUrls = state.referenceUrls ? state.referenceUrls.split("\n") : [];
    const newUrls = Array.from(new Set([...currentUrls, ...urlMatches]));
    state.referenceUrls = newUrls.join("\n");
  }

  // 4. Extração ou definição de assunto
  if (!state.subject) {
    // Se o usuário digitou algo substantivo no primeiro turno
    if (text.length > 2) {
      // Remove menções diretas de formato do assunto se for apenas o formato
      const clean = text
        .replace(/\b(card|post|carrossel|reels|tiktok|vídeo longo|video longo)\b/gi, "")
        .trim();
      state.subject = clean.length > 3 ? clean : text;
    }
  } else if (text.length > 3 && !state.notes) {
    state.notes = text;
  } else if (text.length > 3 && state.notes) {
    state.notes = `${state.notes}\n${text}`;
  }

  // Tags do projeto correspondentes
  if (verified.tags && verified.tags.length > 0) {
    const activeTags = new Set(state.tagIds || []);
    for (const tag of verified.tags) {
      if (lower.includes(tag.name.toLowerCase())) {
        activeTags.add(tag.id);
      }
    }
    state.tagIds = Array.from(activeTags);
  }

  const formatNames: Record<string, string> = {
    card: "Card / Post",
    carrossel: "Carrossel",
    video_longo: "Vídeo Longo",
    reels: "Reels / TikTok",
  };

  // Construção da resposta do agente
  let reply = "";
  const hasImages = (lastUserMsg?.images?.length || 0) > 0;
  const hasVideos = (lastUserMsg?.videos?.length || 0) > 0;
  const hasDocs = (lastUserMsg?.documents?.length || 0) > 0;

  const fileFeedback = [
    hasImages ? "📸 Imagem recebida com sucesso." : null,
    hasVideos ? "🎥 Vídeo recebido com sucesso." : null,
    hasDocs ? "📄 Documento recebido para análise." : null,
  ]
    .filter(Boolean)
    .join(" ");

  if (!state.subject) {
    reply = `Olá! Sou o agente de conteúdo do projeto **${project.name}**.\n\nQual é o **assunto** ou tema principal da demanda que você deseja solicitar hoje?`;
  } else if (!state.format) {
    reply = [
      fileFeedback,
      `Excelente! Anotei o assunto: **"${state.subject}"**.`,
      `Agora, selecione ou digite o **formato de mídia** desejado para este conteúdo:`,
    ]
      .filter(Boolean)
      .join("\n\n");
  } else if (!state.notes && !hasImages && !hasVideos && !hasDocs) {
    const fmt = formatNames[state.format] || state.format;
    reply = [
      fileFeedback,
      `Perfeito! Vamos estruturar um **${fmt}** sobre **"${state.subject}"**.`,
      `Para a equipe produzir com máxima qualidade, envie:\n- **Textos ou pontos principais** da mensagem\n- **Imagens ou vídeos de referência** (pode anexar aqui embaixo)\n- **Prazo desejado** de entrega (ex: sexta-feira, 25/11)`,
    ]
      .filter(Boolean)
      .join("\n\n");
  } else {
    // Temos assunto, formato e informações adicionais!
    state.isReadyToConfirm = true;
    const fmt = formatNames[state.format] || state.format;
    reply = [
      fileFeedback,
      `Ótimo! Coletei todas as informações essenciais para a sua demanda de **${fmt}** no projeto **${project.name}**.`,
      `Revise o cartão resumo abaixo. Quando estiver pronto, clique em **Confirmar e Enviar Demanda** para enviá-la diretamente à equipe!`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return {
    ok: true,
    reply,
    updatedDemand: state,
    project: verified.project,
    verifiedBy: verified.verifiedBy,
  };
}
