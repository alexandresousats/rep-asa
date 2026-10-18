"use client";

import { AppWindow, PanelRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { RichText } from "@/components/ui/rich-text";
import { StatusDot, TagChip } from "@/components/ui/badge";
import { EditableTitle } from "@/components/tasks/editable-title";
import { SubtaskMark } from "@/components/tasks/task-list";
import { addComment, addSubtask, setTaskStatus, updateTask } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/priority";
import { useAccess } from "@/lib/workspace";
import type { Priority, Project, Tag, Task, TaskViewMode, User } from "@/lib/types";

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
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
    }
  }, []);

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
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const { isAdmin, canWrite } = useAccess();

  useEffect(() => {
    const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    if (saved >= MIN_WIDTH && saved <= MAX_WIDTH) setWidth(saved);
  }, []);

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
  const assignee = users.find((user) => user.id === task.assigneeId);
  const project = projects.find((item) => item.id === task.projectId);
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
        {canWrite ? (
          <EditableTitle
            key={task.id}
            as="h2"
            title={task.title}
            startEditing={startEditing}
            className="min-w-0 flex-1 text-lg font-medium leading-snug tracking-tight text-ink"
            onCommit={(title) => updateTask(task.id, { title })}
          />
        ) : (
          <h2 className="min-w-0 flex-1 text-lg font-medium leading-snug tracking-tight text-ink">
            {task.title}
          </h2>
        )}
        <div className="flex shrink-0 items-center gap-1">
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
        <Field label="Responsável">
          <select
            value={task.assigneeId ?? ""}
            disabled={!isAdmin}
            onChange={(event) =>
              updateTask(task.id, { assigneeId: event.target.value || null })
            }
            className="w-full bg-transparent text-ink outline-none disabled:text-ink"
          >
            <option value="">Sem responsável</option>
            {users
              .filter((user) => user.membershipStatus !== "pending")
              .map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          {assignee ? (
            <Avatar initials={assignee.initials} src={assignee.avatar} name={assignee.name} size="sm" />
          ) : null}
        </Field>

        <Field label="Data de conclusão">
          <input
            type="date"
            value={task.dueDate ?? ""}
            disabled={!canWrite}
            onChange={(event) =>
              updateTask(task.id, {
                dueDate: event.target.value || null,
                startDate: event.target.value || task.startDate,
              })
            }
            className="bg-transparent text-ink outline-none disabled:text-ink"
          />
        </Field>

        <Field label="Tags">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const active = task.tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  disabled={!canWrite}
                  onClick={() =>
                    updateTask(task.id, {
                      tagIds: active
                        ? task.tagIds.filter((id) => id !== tag.id)
                        : [...task.tagIds, tag.id],
                    })
                  }
                >
                  <TagChip name={tag.name} color={active ? tag.color : "#737373"} />
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Projeto">
          <span className="flex items-center gap-2 text-ink">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: project?.color }}
            />
            {project?.name}
          </span>
        </Field>

        <Field label="Prioridade">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: PRIORITY_META[task.priority].color }}
            />
            <select
              value={task.priority}
              disabled={!canWrite}
              onChange={(event) =>
                updateTask(task.id, { priority: event.target.value as Priority })
              }
              className="bg-transparent outline-none disabled:opacity-100"
              style={{ color: PRIORITY_META[task.priority].color }}
            >
              {PRIORITY_ORDER.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_META[priority].label}
                </option>
              ))}
            </select>
          </span>
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
                value={subtaskTitle}
                onChange={(event) => setSubtaskTitle(event.target.value)}
                placeholder="Adicionar subtarefa"
                className="w-full bg-transparent py-2 text-sm text-ink outline-none placeholder:text-faint"
              />
            </form>
            ) : null}
          </div>
        </div>

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
          {canWrite ? (
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
              placeholder="Adicione um comentário ou mencione a equipe"
              className="w-full rounded-2xl border border-line bg-base px-4 py-3 text-sm text-ink outline-none placeholder:text-faint"
            />
          </form>
          ) : null}
        </div>
      </div>
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
