import type { Priority } from "./types";

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  baixa: { label: "Baixa", color: "#64748b" },
  media: { label: "Média", color: "#eab308" },
  alta: { label: "Alta", color: "#f97316" },
  urgente: { label: "Urgente", color: "#ef4444" },
};

export const PRIORITY_ORDER: Priority[] = ["urgente", "alta", "media", "baixa"];
