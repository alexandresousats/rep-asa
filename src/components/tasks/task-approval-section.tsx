"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Film,
  Globe,
  Layers,
  Link2,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Smartphone,
  Square,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { updateTaskApproval } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import type { Task, User } from "@/lib/types";
import { useAccess, useWorkspace } from "@/lib/workspace";

function getFormatBadge(format?: string | null) {
  if (!format) return null;
  const f = format.toLowerCase();
  if (f === "card") {
    return {
      label: "Card / Post",
      icon: Square,
      badgeClass: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    };
  }
  if (f === "carrossel") {
    return {
      label: "Carrossel",
      icon: Layers,
      badgeClass: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
    };
  }
  if (f === "video_longo" || f.includes("longo")) {
    return {
      label: "Vídeo Longo",
      icon: Film,
      badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    };
  }
  if (f === "reels" || f.includes("tiktok")) {
    return {
      label: "Reels / TikTok",
      icon: Smartphone,
      badgeClass: "bg-pink-500/15 text-pink-400 border-pink-500/30",
    };
  }
  return {
    label: format,
    icon: Globe,
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  };
}

export function TaskApprovalSection({ task }: { task: Task }) {
  const { isClient, isAdmin, canWrite } = useAccess();
  const users = useWorkspace((state) => state.users);

  const [isUpdating, setIsUpdating] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [approveNote, setApproveNote] = useState("");

  const status = task.approvalStatus ?? "none";
  const approver = task.approvedById
    ? users.find((u) => u.id === task.approvedById)?.name ?? "Cliente"
    : "Cliente";

  const formatBadge = getFormatBadge(task.demandFormat);

  async function handleApprove() {
    setIsUpdating(true);
    try {
      await updateTaskApproval(task.id, {
        status: "approved",
        feedback: approveNote.trim() || undefined,
      });
      setApproveDialogOpen(false);
      setApproveNote("");
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleRequestChanges() {
    if (!feedback.trim()) return;
    setIsUpdating(true);
    try {
      await updateTaskApproval(task.id, {
        status: "changes_requested",
        feedback: feedback.trim(),
      });
      setRejectDialogOpen(false);
      setFeedback("");
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleSendForApproval() {
    setIsUpdating(true);
    try {
      await updateTaskApproval(task.id, {
        status: "pending",
      });
    } finally {
      setIsUpdating(false);
    }
  }

  // Parse reference URLs
  const rawUrls = task.referenceUrls
    ?.split(/\r?\n/)
    .map((u) => u.trim())
    .filter(Boolean) ?? [];

  return (
    <div className="space-y-3">
      {/* Format Badge if present */}
      {formatBadge ? (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-faint">Formato:</span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              formatBadge.badgeClass,
            )}
          >
            <formatBadge.icon className="h-3.5 w-3.5" />
            {formatBadge.label}
          </span>
        </div>
      ) : null}

      {/* Reference Links if present */}
      {rawUrls.length > 0 ? (
        <div className="rounded-2xl border border-line/60 bg-base/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Link2 className="h-3.5 w-3.5 text-sky-400" />
            Links de Referência ({rawUrls.length})
          </p>
          <div className="space-y-1">
            {rawUrls.map((url, i) => {
              const display = url.replace(/^https?:\/\//, "");
              const isUrl = /^https?:\/\//.test(url);
              return (
                <div key={i} className="flex items-center justify-between gap-2 text-xs">
                  {isUrl ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 truncate text-sky-400 transition-colors hover:underline"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0 text-faint" />
                      <span className="truncate">{display}</span>
                    </a>
                  ) : (
                    <span className="truncate text-ink">{url}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Approval Status Card */}
      {status === "pending" ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5">
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400 animate-pulse" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-amber-300">
                Aguardando Aprovação do Cliente
              </p>
              <p className="mt-0.5 text-xs text-amber-200/80">
                O material foi enviado para aprovação do cliente.
              </p>

              {/* Action buttons for Client or Admin */}
              {isClient || isAdmin ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 shadow-sm"
                    onClick={() => setApproveDialogOpen(true)}
                    disabled={isUpdating}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                    Aprovar Material
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="border border-amber-500/30 text-amber-200 hover:bg-amber-500/20 gap-1.5"
                    onClick={() => setRejectDialogOpen(true)}
                    disabled={isUpdating}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                    Solicitar Ajustes
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : status === "approved" ? (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-emerald-300">
                  Aprovado pelo Cliente ✅
                </p>
                {task.approvedAt ? (
                  <span className="text-[10px] text-emerald-400/80">
                    {formatDay(task.approvedAt)}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-emerald-200/80">
                Aprovado por <span className="font-medium text-emerald-100">{approver}</span>.
              </p>
              {task.approvalFeedback ? (
                <div className="mt-2 rounded-xl bg-emerald-950/40 border border-emerald-500/20 p-2 text-xs text-emerald-100">
                  <span className="text-[10px] uppercase text-emerald-400 font-semibold block mb-0.5">
                    Nota de aprovação
                  </span>
                  &ldquo;{task.approvalFeedback}&rdquo;
                </div>
              ) : null}

              {/* Allow re-submitting if needed */}
              {canWrite ? (
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={handleSendForApproval}
                    disabled={isUpdating}
                    className="text-[11px] text-emerald-300/80 hover:text-emerald-200 underline"
                  >
                    Reabrir aprovação
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : status === "changes_requested" ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3.5">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-red-300">
                  Ajustes Solicitados ⚠️
                </p>
                {task.approvedAt ? (
                  <span className="text-[10px] text-red-400/80">
                    {formatDay(task.approvedAt)}
                  </span>
                ) : null}
              </div>
              {task.approvalFeedback ? (
                <div className="mt-2 rounded-xl bg-red-950/40 border border-red-500/20 p-2.5 text-xs text-red-100">
                  <span className="text-[10px] uppercase text-red-300 font-semibold block mb-0.5">
                    Ajustes indicados pelo cliente:
                  </span>
                  &ldquo;{task.approvalFeedback}&rdquo;
                </div>
              ) : null}

              {/* Re-send for approval after fixing */}
              {canWrite ? (
                <div className="mt-3">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={handleSendForApproval}
                    disabled={isUpdating}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Enviar novamente para aprovação
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        /* Status: none - show button to send for approval if team has permission */
        canWrite && (
          <div className="flex items-center justify-between rounded-2xl border border-line/60 bg-base/50 p-2.5">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Clock className="h-3.5 w-3.5 text-faint" />
              <span>Aprovação do cliente</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs text-ink hover:bg-hover"
              onClick={handleSendForApproval}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 text-sky-400" />
              )}
              Enviar para aprovação
            </Button>
          </div>
        )
      )}

      {/* Dialog for Approving */}
      <Dialog
        open={approveDialogOpen}
        title="Aprovar Material"
        onClose={() => setApproveDialogOpen(false)}
      >
        <p className="mb-4 text-xs text-faint">
          Você está aprovando o material desta demanda. A equipe receberá a notificação de aprovação.
        </p>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-muted">
            Nota de aprovação ou elogio (opcional)
          </label>
          <textarea
            rows={2}
            placeholder="Ex: Ficou excelente! Pode publicar."
            value={approveNote}
            onChange={(e) => setApproveNote(e.target.value)}
            className="w-full rounded-2xl border border-line bg-base p-3 text-xs text-ink outline-none transition-all placeholder:text-faint focus:border-ink"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setApproveDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
              onClick={handleApprove}
              disabled={isUpdating}
            >
              {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Confirmar Aprovação
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Dialog for Requesting Changes */}
      <Dialog
        open={rejectDialogOpen}
        title="Solicitar Ajustes"
        onClose={() => setRejectDialogOpen(false)}
      >
        <p className="mb-4 text-xs text-faint">
          Descreva detalhadamente o que a equipe precisa ajustar ou alterar no material.
        </p>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-muted">
            O que precisa ser corrigido? <span className="text-red-400">*</span>
          </label>
          <textarea
            rows={3}
            required
            placeholder="Ex: Trocar a música do reels, diminuir o texto no slide 3, e corrigir a cor do logo para a oficial."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="w-full rounded-2xl border border-line bg-base p-3 text-xs text-ink outline-none transition-all placeholder:text-faint focus:border-ink"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRejectDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-500 text-white gap-1.5"
              onClick={handleRequestChanges}
              disabled={isUpdating || !feedback.trim()}
            >
              {isUpdating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertCircle className="h-3.5 w-3.5" />}
              Enviar Pedido de Ajustes
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
