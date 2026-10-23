import { completeOneShot, type AgentConfig } from "./agent";
import type { DemandChatMessage, DemandExtractionState } from "./demand-types";

const FORMAT_IDS = new Set(["card", "carrossel", "video_longo", "reels"]);

type AiDemandPatch = {
  intent?: "confirm" | "provide_info" | "edit" | "unknown";
  subject?: string | null;
  format?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  referenceUrls?: string | null;
  confirm?: boolean;
};

function transcript(messages: DemandChatMessage[], limit = 12) {
  return messages
    .slice(-limit)
    .map((m) => `${m.role === "user" ? "Cliente" : "Agente"}: ${m.content}`.trim())
    .join("\n");
}

export async function interpretDemandWithAgent(
  config: AgentConfig,
  messages: DemandChatMessage[],
  state: DemandExtractionState,
): Promise<{
  state: DemandExtractionState;
  submitRequested: boolean;
} | null> {
  const system = [
    "Você analisa mensagens de clientes que abrem demandas de conteúdo (card, carrossel, vídeo, reels).",
    "Responda APENAS com um JSON válido, sem markdown.",
    "Campos:",
    '- intent: "confirm" | "provide_info" | "edit" | "unknown"',
    "- subject: string ou null",
    '- format: "card" | "carrossel" | "video_longo" | "reels" ou null',
    "- dueDate: AAAA-MM-DD ou null",
    "- notes: string ou null (briefing, não repita assunto/prazo)",
    "- referenceUrls: string ou null (links, um por linha)",
    "- confirm: true se o cliente confirmou envio (ex.: sim, confirmo, pode enviar)",
    "Regras:",
    "- Interprete datas em português (ex.: dia 25 de outubro → 2026-10-25 se ano omitido use o ano atual).",
    '- "sim" após um resumo de demanda → intent confirm e confirm true.',
    "- Não invente assunto; use o estado atual se a mensagem não trouxer assunto novo.",
  ].join("\n");

  const user = JSON.stringify(
    {
      hoje: new Date().toISOString().slice(0, 10),
      estadoAtual: state,
      conversa: transcript(messages),
    },
    null,
    2,
  );

  try {
    const raw = await completeOneShot(config, system, user);
    const parsed = JSON.parse(raw) as AiDemandPatch;
    const next: DemandExtractionState = { ...state };

    if (parsed.subject && parsed.subject.trim()) next.subject = parsed.subject.trim();
    if (parsed.format && FORMAT_IDS.has(parsed.format)) next.format = parsed.format;
    if (parsed.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate)) next.dueDate = parsed.dueDate;
    if (parsed.notes?.trim()) {
      next.notes = next.notes ? `${next.notes}\n${parsed.notes.trim()}` : parsed.notes.trim();
    }
    if (parsed.referenceUrls?.trim()) next.referenceUrls = parsed.referenceUrls.trim();

    const submitRequested = parsed.confirm === true || parsed.intent === "confirm";

    if (next.subject && next.format && next.dueDate) {
      next.isReadyToConfirm = true;
    }

    return { state: next, submitRequested };
  } catch {
    return null;
  }
}
