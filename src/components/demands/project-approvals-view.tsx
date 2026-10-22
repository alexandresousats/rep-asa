"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Film,
  Layers,
  Link2,
  Paperclip,
  RotateCcw,
  Smartphone,
  Square,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { updateTaskApproval } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import type { Project, Tag, Task, User } from "@/lib/types";
import { useAccess } from "@/lib/workspace";
import { TaskFormatBadge } from "@/components/tasks/task-approval-badge";

export function ProjectApprovalsView({
  project,
  tasks,
  users,
  tags,
  onSelectTask,
}: {
  project: Project;
  tasks: Task[];
  users: User[];
  tags: Tag[];
  onSelectTask: (id: string) => void;
}) {
  const { isClient, isAdmin, canWrite } = useAccess();

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const pending = useMemo(
    () => tasks.filter((t) => t.approvalStatus === "pending" && !t.id.startsWith("hist-")),
    [tasks],
  );
  const changes = useMemo(
    () => tasks.filter((t) => t.approvalStatus === "changes_requested" && !t.id.startsWith("hist-")),
    [tasks],
  );
  const approved = useMemo(
    () => tasks.filter((t) => t.approvalStatus === "approved" && !t.id.startsWith("hist-")),
    [tasks],
  );

  async function handleApprove() {
    if (!activeTask) return;
    setIsUpdating(true);
    try {
      await updateTaskApproval(activeTask.id, {
        status: "approved",
        feedback: approveNote.trim() || undefined,
      });
      setApproveOpen(false);
      setApproveNote("");
      setActiveTask(null);
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleRequestChanges() {
    if (!activeTask || !feedback.trim()) return;
    setIsUpdating(true);
    try {
      await updateTaskApproval(activeTask.id, {
        status: "changes_requested",
        feedback: feedback.trim(),
      });
      setRejectOpen(false);
      setFeedback("");
      setActiveTask(null);
    } finally {
      setIsUpdating(false);
    }
  }

  const columns = [
    {
      id: "pending",
      title: "Aguardando Aprovação",
      icon: Clock,
      color: "text-amber-400",
      border: "border-amber-500/30",
      bg: "bg-amber-500/5",
      countBadge: "bg-amber-500/15 text-amber-300",
      list: pending,
    },
    {
      id: "changes_requested",
      title: "Ajustes Solicitados",
      icon: AlertCircle,
      color: "text-red-400",
      border: "border-red-500/30",
      bg: "bg-red-500/5",
      countBadge: "bg-red-500/15 text-red-300",
      list: changes,
    },
    {
      id: "approved",
      title: "Aprovadas pelo Cliente",
      icon: CheckCircle2,
      color: "text-emerald-400",
      border: "border-emerald-500/30",
      bg: "bg-emerald-500/5",
      countBadge: "bg-emerald-500/15 text-emerald-300",
      list: approved,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-base p-6">
      <div className="mb-6">
        <h2 className="text-base font-medium text-ink">Painel de Aprovação de Tarefas</h2>
        <p className="text-xs text-faint">
          Fluxo de aprovação das entregas criativas pelo cliente.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto md:grid-cols-3">
        {columns.map((col) => {
          const Icon = col.icon;
          return (
            <div
              key={col.id}
              className={cn(
                "flex flex-col rounded-2xl border bg-elevated/50 p-4 min-h-[300px]",
                col.border,
              )}
            >
              {/* Column Header */}
              <div className="mb-4 flex items-center justify-between pb-2 border-b border-line-subtle">
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-4 w-4", col.color)} />
                  <span className="text-xs font-semibold text-ink">{col.title}</span>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", col.countBadge)}>
                  {col.list.length}
                </span>
              </div>

              {/* Tasks List */}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {col.list.length === 0 ? (
                  <div className="py-12 text-center text-xs text-faint">
                    Nenhuma tarefa neste status
                  </div>
                ) : (
                  col.list.map((task) => {
                    const assignee = users.find((u) => u.id === task.assigneeId);
                    const attachmentsCount = task.attachments?.length ?? 0;

                    return (
                      <div
                        key={task.id}
                        onClick={() => onSelectTask(task.id)}
                        className="group flex flex-col justify-between rounded-xl border border-line bg-base p-3.5 shadow-sm transition-all hover:border-line-subtle hover:shadow cursor-pointer"
                      >
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-1.5">
                            <TaskFormatBadge format={task.demandFormat} />
                            {task.dueDate ? (
                              <span className="text-[10px] text-faint">
                                {formatDay(task.dueDate)}
                              </span>
                            ) : null}
                          </div>

                          <h4 className="text-xs font-medium text-ink leading-snug">
                            {task.title}
                          </h4>

                          {/* If changes requested, show preview of feedback */}
                          {col.id === "changes_requested" && task.approvalFeedback ? (
                            <div className="mt-2 rounded-lg bg-red-950/30 border border-red-500/20 p-2 text-[11px] text-red-200">
                              <span className="font-semibold block mb-0.5">Ajuste:</span>
                              &ldquo;{task.approvalFeedback}&rdquo;
                            </div>
                          ) : null}

                          {/* If approved, show feedback or date */}
                          {col.id === "approved" && task.approvalFeedback ? (
                            <div className="mt-2 rounded-lg bg-emerald-950/30 border border-emerald-500/20 p-2 text-[11px] text-emerald-200">
                              &ldquo;{task.approvalFeedback}&rdquo;
                            </div>
                          ) : null}
                        </div>

                        {/* Card Footer */}
                        <div className="mt-3 flex items-center justify-between border-t border-line-subtle pt-2.5 text-[11px] text-faint">
                          <div className="flex items-center gap-2">
                            {attachmentsCount > 0 ? (
                              <span className="flex items-center gap-1 text-muted">
                                <Paperclip className="h-3 w-3" />
                                {attachmentsCount}
                              </span>
                            ) : null}
                            <span>{assignee ? assignee.name.split(" ")[0] : "Equipe"}</span>
                          </div>

                          {/* Quick buttons inside card if pending and client/admin */}
                          {col.id === "pending" && (isClient || isAdmin) ? (
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <Button
                                size="sm"
                                className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
                                onClick={() => {
                                  setActiveTask(task);
                                  setApproveOpen(true);
                                }}
                              >
                                <ThumbsUp className="h-3 w-3" />
                                Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-[11px] border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 gap-1"
                                onClick={() => {
                                  setActiveTask(task);
                                  setRejectOpen(true);
                                }}
                              >
                                <ThumbsDown className="h-3 w-3" />
                                Ajustes
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Approval Dialog */}
      <Dialog
        open={approveOpen}
        title="Aprovar Entrega"
        onClose={() => setApproveOpen(false)}
      >
        <p className="mb-4 text-xs text-faint">
          Confirmar aprovação de &ldquo;{activeTask?.title}&rdquo;.
        </p>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-muted">
            Nota de aprovação ou elogio (opcional)
          </label>
          <textarea
            rows={2}
            placeholder="Ex: Aprovado! Parabéns à equipe pelo resultado."
            value={approveNote}
            onChange={(e) => setApproveNote(e.target.value)}
            className="w-full rounded-2xl border border-line bg-base p-3 text-xs text-ink outline-none transition-all placeholder:text-faint focus:border-ink"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setApproveOpen(false)}
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
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirmar Aprovação
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Reject / Changes Dialog */}
      <Dialog
        open={rejectOpen}
        title="Solicitar Ajustes no Material"
        onClose={() => setRejectOpen(false)}
      >
        <p className="mb-4 text-xs text-faint">
          Indique o que precisa ser ajustado em &ldquo;{activeTask?.title}&rdquo;.
        </p>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-muted">
            O que precisa ser alterado? <span className="text-red-400">*</span>
          </label>
          <textarea
            rows={3}
            required
            placeholder="Descreva com detalhes as correções ou ajustes desejados..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="w-full rounded-2xl border border-line bg-base p-3 text-xs text-ink outline-none transition-all placeholder:text-faint focus:border-ink"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRejectOpen(false)}
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
              <AlertCircle className="h-3.5 w-3.5" />
              Enviar Pedido de Ajustes
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
