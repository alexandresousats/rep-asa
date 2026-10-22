"use client";

import { AlertCircle, CheckCircle2, Clock, Film, Layers, Smartphone, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Task } from "@/lib/types";

export function TaskApprovalBadge({ status, className }: { status?: Task["approvalStatus"]; className?: string }) {
  if (!status || status === "none") return null;

  if (status === "pending") {
    return (
      <span
        title="Aguardando aprovação do cliente"
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 shrink-0",
          className,
        )}
      >
        <Clock className="h-2.5 w-2.5 animate-pulse" />
        Em aprovação
      </span>
    );
  }

  if (status === "approved") {
    return (
      <span
        title="Aprovado pelo cliente"
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 shrink-0",
          className,
        )}
      >
        <CheckCircle2 className="h-2.5 w-2.5" />
        Aprovado
      </span>
    );
  }

  if (status === "changes_requested") {
    return (
      <span
        title="Ajustes solicitados pelo cliente"
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400 shrink-0",
          className,
        )}
      >
        <AlertCircle className="h-2.5 w-2.5" />
        Ajustes
      </span>
    );
  }

  return null;
}

export function TaskFormatBadge({ format, className }: { format?: string | null; className?: string }) {
  if (!format) return null;
  const f = format.toLowerCase();

  let Icon = Square;
  let label = format;
  let badgeClass = "border-sky-500/30 bg-sky-500/10 text-sky-400";

  if (f === "card") {
    Icon = Square;
    label = "Card";
    badgeClass = "border-sky-500/30 bg-sky-500/10 text-sky-400";
  } else if (f === "carrossel") {
    Icon = Layers;
    label = "Carrossel";
    badgeClass = "border-indigo-500/30 bg-indigo-500/10 text-indigo-400";
  } else if (f === "video_longo" || f.includes("longo")) {
    Icon = Film;
    label = "Vídeo Longo";
    badgeClass = "border-amber-500/30 bg-amber-500/10 text-amber-400";
  } else if (f === "reels" || f.includes("tiktok")) {
    Icon = Smartphone;
    label = "Reels";
    badgeClass = "border-pink-500/30 bg-pink-500/10 text-pink-400";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium shrink-0",
        badgeClass,
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}
