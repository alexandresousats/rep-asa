"use client";

import { AppWindow, Check, PanelRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { RichText } from "@/components/ui/rich-text";
import { StatusDot } from "@/components/ui/badge";
import { TaskTagPicker } from "@/components/tasks/task-tag-picker";
import { TaskAssigneePicker } from "@/components/tasks/task-assignee-picker";
import { TaskDatePicker } from "@/components/tasks/task-date-picker";
import { TaskProjectPicker } from "@/components/tasks/task-project-picker";
import { TaskPriorityPicker } from "@/components/tasks/task-priority-picker";
import { TaskAttachments } from "@/components/tasks/task-attachments";
import { TaskActionsMenu } from "@/components/tasks/task-actions-menu";
import { EditableTitle } from "@/components/tasks/editable-title";
import { SubtaskMark } from "@/components/tasks/task-list";
import { TaskApprovalSection } from "@/components/tasks/task-approval-section";
import { TaskApprovalBadge, TaskFormatBadge } from "@/components/tasks/task-approval-badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { addComment, addSubtask, deleteTask, setTaskFollow, setTaskStatus, updateTask } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { useAccess, useWorkspace } from "@/lib/workspace";
import type { Project, Tag, Task, TaskViewMode, User } from "@/lib/types";

const PANEL_WIDTH_KEY = "asa-task-panel-width";
const DEFAULT_WIDTH = 448;
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;

export function TaskViewer({
  task,
  users,
  tags,
  projects,
  mode,
  onModeChange,
  onClose,
  subtasks = [],
  onOpenSubtask,
  startEditing = false,
}: {
  task: Task;
  users: User[];
  tags: Tag[];
  projects: Project[];
  mode: TaskViewMode;
  onModeChange: (mode: TaskViewMode) => void;
  onClose: () => void;
  subtasks?: Task[];
  onOpenSubtask?: (id: string) => void;
  startEditing?: boolean;
}) {
  useEffect(() => {
    if (mode !== "modal") return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onClose]);

  const shared = {
    task,
    users,
    tags,
    projects,
    view: mode,
    onViewChange: onModeChange,
    onClose,
    subtasks,
    onOpenSubtask,
    startEditing,
  };

  if (mode === "modal") {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
        <button
          type="button"
          className="overlay-in absolute inset-0 bg-black/50"
          aria-label="Fechar"
          onClick={onClose}
        />
        <div className="modal-in relative flex h-[min(820px,calc(100dvh-2rem))] w-full max-w-2xl overflow-hidden rounded-[24px] bg-elevated">
          <TaskPanel {...shared} />
        </div>
      </div>
    );
  }

  return (
    <>
      <PanelReveal>
        <TaskPanel {...shared} resizable />
      </PanelReveal>
      <div className="fixed inset-0 z-30 lg:hidden">
        <button
          type="button"
          className="overlay-in absolute inset-0 bg-black/50"
          aria-label="Fechar"
          onClick={onClose}
        />
        <div className="drawer-in absolute inset-y-0 right-0 w-full max-w-md">
          <TaskPanel {...shared} />
        </div>
      </div>
    </>
  );
}

function PanelReveal({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  return (
    <div
      className="panel-reveal hidden h-full min-h-0 lg:grid"
      onAnimationEnd={(event) => {
        if (event.currentTarget === event.target) setShown(true);
      }}
    >
      <div className={cn("h-full min-h-0 min-w-0", shown ? "overflow-visible" : "overflow-hidden")}>
        {children}
      </div>
    </div>
  );
}

export function TaskPanel({
  task,
  users,
  tags,
  projects,
  onClose,
  resizable = false,
  view = "sidebar",
  onViewChange,
  subtasks = [],
  onOpenSubtask,
  startEditing = false,
}: {
  task: Task;
  users: User[];
  tags: Tag[];
  projects: Project[];
  onClose: () => void;
  resizable?: boolean;
  view?: TaskViewMode;
  onViewChange?: (mode: TaskViewMode) => void;
  subtasks?: Task[];
  onOpenSubtask?: (id: string) => void;
  startEditing?: boolean;
}) {
  const [comment, setComment] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    if (saved >= MIN_WIDTH && saved <= MAX_WIDTH) return saved;
    return DEFAULT_WIDTH;
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const { canWrite, isClient } = useAccess();
  const userId = useWorkspace((state) => state.user?.id);
  const following = Boolean(userId && task.followerIds?.includes(userId));

  function startResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function move(moveEvent: PointerEvent) {
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth + (startX - moveEvent.clientX)),
      );
      setWidth(next);
      localStorage.setItem(PANEL_WIDTH_KEY, String(next));
    }

    function stop() {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }
  const doneCount = subtasks.filter((item) => item.status === "done").length;

  return (
    <aside
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-elevated"
      style={resizable ? { width } : undefined}
    >
      {resizable ? (
        <button
          type="button"
          aria-label="Redimensionar painel"
          onPointerDown={startResize}
          className="absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-col-resize"
        />
      ) : null}
      <div className="flex items-start justify-between gap-4 border-b border-line-subtle px-5 py-5">
        <div className="min-w-0 flex-1">
          {canWrite ? (
            <EditableTitle
              key={task.id}
              as="h2"
              title={task.title}
              startEditing={startEditing}
              className="min-w-0 text-lg font-medium leading-snug tracking-tight text-ink"
              onCommit={(title) => updateTask(task.id, { title })}
            />
          ) : (
            <h2 className="min-w-0 text-lg font-medium leading-snug tracking-tight text-ink">
              {task.title}
            </h2>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <TaskFormatBadge format={task.demandFormat} />
            <TaskApprovalBadge status={task.approvalStatus} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canWrite ? (
            <button
              type="button"
              onClick={() => setTaskStatus(task.id, task.status === "done" ? "todo" : "done")}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
                task.status === "done"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-ink text-base hover:opacity-90",
              )}
            >
              <Check className="h-3 w-3" strokeWidth={3} />
              {task.status === "done" ? "Reabrir" : "Concluir"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void setTaskFollow(task.id, !following)}
            className="rounded-full px-3 py-1 text-xs text-faint hover:bg-hover hover:text-ink"
          >
            {following ? "Seguindo" : "Seguir"}
          </button>
          <TaskActionsMenu
            task={task}
            canWrite={canWrite}
            onFocusProjects={() => {
              document.querySelector<HTMLButtonElement>('[aria-label="Alterar projeto"]')?.click();
            }}
            onFocusSubtasks={() => {
              subtaskInputRef.current?.focus();
              subtaskInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            onFocusTags={() => {
              document.querySelector<HTMLButtonElement>('[aria-label="Adicionar tag"]')?.click();
            }}
            onTriggerAttach={() => {
              document.querySelector<HTMLInputElement>('input[type="file"][multiple]')?.click();
            }}
            onDeleteTask={() => {
              setDeleteError("");
              setConfirmDelete(true);
            }}
          />
          {onViewChange ? (
            <>
              <button
                type="button"
                aria-label="Painel lateral"
                title="Painel lateral"
                onClick={() => onViewChange("sidebar")}
                className={cn(
                  "rounded-full p-1.5",
                  view === "sidebar" ? "bg-hover text-ink" : "text-faint hover:text-ink",
                )}
              >
                <PanelRight className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                aria-label="Modal"
                title="Modal"
                onClick={() => onViewChange("modal")}
                className={cn(
                  "rounded-full p-1.5",
                  view === "modal" ? "bg-hover text-ink" : "text-faint hover:text-ink",
                )}
              >
                <AppWindow className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-faint hover:bg-hover hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5 text-sm">
        <TaskApprovalSection task={task} />

        <Field label="Responsável">
          <TaskAssigneePicker
            assigneeId={task.assigneeId}
            users={users}
            canWrite={canWrite}
            onSelect={(assigneeId) => updateTask(task.id, { assigneeId })}
          />
        </Field>

        <Field label="Data de conclusão">
          <TaskDatePicker
            dueDate={task.dueDate}
            canWrite={canWrite}
            onChange={(dueDate) =>
              updateTask(task.id, {
                dueDate,
                startDate: dueDate || task.startDate,
              })
            }
          />
        </Field>

        <Field label="Tags">
          <TaskTagPicker
            tagIds={task.tagIds}
            tags={tags}
            canWrite={canWrite}
            onUpdateTagIds={(nextIds) => updateTask(task.id, { tagIds: nextIds })}
          />
        </Field>

        <Field label="Projeto">
          <TaskProjectPicker
            projectId={task.projectId}
            section={task.section}
            projects={projects}
            canWrite={canWrite}
            onChangeProject={(projectId, section) =>
              updateTask(task.id, { projectId, section })
            }
            onChangeSection={(section) => updateTask(task.id, { section })}
          />
        </Field>

        <Field label="Prioridade">
          <TaskPriorityPicker
            priority={task.priority}
            canWrite={canWrite}
            onChange={(priority) => updateTask(task.id, { priority })}
          />
        </Field>

        <div>
          <p className="mb-2 text-faint">Descrição</p>
          <RichText
            key={task.id}
            value={task.description}
            onChange={(description) => {
              if (canWrite) updateTask(task.id, { description });
            }}
          />
        </div>

        <div>
          <p className="mb-3 text-faint">
            Subtarefas {doneCount}/{subtasks.length}
          </p>
          <div className="space-y-2">
            {subtasks.map((subtask) => {
              const person = users.find((user) => user.id === subtask.assigneeId);
              return (
                <div key={subtask.id} className="flex items-center gap-2 pl-1">
                  <SubtaskMark />
                  <button
                    type="button"
                    disabled={!canWrite}
                    onClick={() =>
                      setTaskStatus(
                        subtask.id,
                        subtask.status === "done" ? "todo" : "done",
                      )
                    }
                  >
                    <StatusDot done={subtask.status === "done"} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenSubtask?.(subtask.id)}
                    className={cn(
                      "min-w-0 flex-1 truncate text-left",
                      subtask.status === "done" ? "text-faint line-through" : "text-ink",
                    )}
                  >
                    {subtask.title}
                  </button>
                  {person ? (
                    <Avatar initials={person.initials} src={person.avatar} name={person.name} size="sm" />
                  ) : null}
                  {subtask.dueDate ? (
                    <span className="shrink-0 text-xs text-faint">
                      {formatDay(subtask.dueDate)}
                    </span>
                  ) : null}
                </div>
              );
            })}
            {canWrite ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!subtaskTitle.trim()) return;
                void addSubtask(task.id, subtaskTitle);
                setSubtaskTitle("");
              }}
            >
              <input
                ref={subtaskInputRef}
                value={subtaskTitle}
                onChange={(event) => setSubtaskTitle(event.target.value)}
                placeholder="Adicionar subtarefa"
                className="w-full bg-transparent py-2 text-sm text-ink outline-none placeholder:text-faint"
              />
            </form>
            ) : null}
          </div>
        </div>

        <TaskAttachments
          taskId={task.id}
          attachments={task.attachments}
          canWrite={Boolean(canWrite || isClient)}
        />

        <div>
          <p className="mb-3 text-faint">Comentários</p>
          <div className="space-y-3">
            {task.comments.map((item) => {
              const author = users.find((user) => user.id === item.authorId);
              return (
                <div key={item.id} className="flex gap-3">
                  <Avatar
                    initials={author?.initials ?? "?"}
                    src={author?.avatar}
                    name={author?.name}
                    size="sm"
                  />
                  <div>
                    <p className="text-xs text-faint">{author?.name}</p>
                    <p className="text-ink">{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {canWrite || isClient ? (
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!comment.trim()) return;
              void addComment(task.id, comment);
              setComment("");
            }}
          >
            <input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Adicione um comentário ou tire dúvidas"
              className="w-full rounded-2xl border border-line bg-base px-4 py-3 text-sm text-ink outline-none placeholder:text-faint"
            />
          </form>
          ) : null}
        </div>

        {canWrite ? (
          <div className="border-t border-line-subtle pt-4">
            <button
              type="button"
              onClick={() => {
                setDeleteError("");
                setConfirmDelete(true);
              }}
              className="text-xs text-faint hover:text-ink"
            >
              Excluir tarefa
            </button>
          </div>
        ) : null}
      </div>
      <Dialog
        open={confirmDelete}
        title="Excluir tarefa"
        onClose={() => {
          if (!deleting) setConfirmDelete(false);
        }}
      >
        <p className="text-sm leading-6 text-faint">
          {subtasks.length > 0
            ? `${task.title} será excluída, junto com as subtarefas.`
            : `${task.title} será excluída.`}
        </p>
        {deleteError ? <p className="mt-3 text-sm text-red-400">{deleteError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={deleting}
            onClick={() => setConfirmDelete(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={deleting}
            onClick={() => {
              setDeleting(true);
              setDeleteError("");
              void deleteTask(task.id).then((result) => {
                setDeleting(false);
                if (!result.ok) {
                  setDeleteError(result.error);
                  return;
                }
                setConfirmDelete(false);
                onClose();
              });
            }}
          >
            Excluir
          </Button>
        </div>
      </Dialog>
    </aside>
  );
}


function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="w-36 shrink-0 pt-0.5 text-faint">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
        {children}
      </div>
    </div>
  );
}
