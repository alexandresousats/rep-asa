"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { RichText } from "@/components/ui/rich-text";
import { StatusDot, TagChip } from "@/components/ui/badge";
import { addComment, addSubtask, toggleSubtask, updateTask } from "@/lib/api";
import { formatDay } from "@/lib/dates";
import type { Priority, Project, Tag, Task, User } from "@/lib/types";

const PANEL_WIDTH_KEY = "asa-task-panel-width";
const DEFAULT_WIDTH = 448;
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
];

export function TaskPanel({
  task,
  users,
  tags,
  projects,
  onClose,
  resizable = false,
}: {
  task: Task;
  users: User[];
  tags: Tag[];
  projects: Project[];
  onClose: () => void;
  resizable?: boolean;
}) {
  const [comment, setComment] = useState("");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [width, setWidth] = useState(DEFAULT_WIDTH);

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
  const doneCount = task.subtasks.filter((item) => item.done).length;

  return (
    <aside
      className="relative flex h-full w-full flex-col border-l border-line bg-elevated"
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
        <h2 className="text-lg font-medium leading-snug tracking-tight text-ink">
          {task.title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-faint hover:bg-hover hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 text-sm">
        <Field label="Responsável">
          <select
            value={task.assigneeId ?? ""}
            onChange={(event) =>
              updateTask(task.id, { assigneeId: event.target.value || null })
            }
            className="w-full bg-transparent text-ink outline-none"
          >
            <option value="">Sem responsável</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
          {assignee ? <Avatar initials={assignee.initials} size="sm" /> : null}
        </Field>

        <Field label="Data de conclusão">
          <input
            type="date"
            value={task.dueDate ?? ""}
            onChange={(event) =>
              updateTask(task.id, {
                dueDate: event.target.value || null,
                startDate: event.target.value || task.startDate,
              })
            }
            className="bg-transparent text-ink outline-none"
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
          <select
            value={task.priority}
            onChange={(event) =>
              updateTask(task.id, { priority: event.target.value as Priority })
            }
            className="bg-transparent text-ink outline-none"
          >
            {PRIORITIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <p className="mb-2 text-faint">Descrição</p>
          <RichText
            key={task.id}
            value={task.description}
            onChange={(description) => updateTask(task.id, { description })}
          />
        </div>

        <div>
          <p className="mb-3 text-faint">
            Subtarefas {doneCount}/{task.subtasks.length}
          </p>
          <div className="space-y-2">
            {task.subtasks.map((subtask) => (
              <button
                key={subtask.id}
                type="button"
                onClick={() => toggleSubtask(task.id, subtask.id)}
                className="flex w-full items-center gap-3 text-left"
              >
                <StatusDot done={subtask.done} />
                <span className={subtask.done ? "text-faint line-through" : "text-ink"}>
                  {subtask.title}
                </span>
                {subtask.dueDate ? (
                  <span className="ml-auto text-xs text-faint">
                    {formatDay(subtask.dueDate)}
                  </span>
                ) : null}
              </button>
            ))}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!subtaskTitle.trim()) return;
                addSubtask(task.id, subtaskTitle);
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
          </div>
        </div>

        <div>
          <p className="mb-3 text-faint">Comentários</p>
          <div className="space-y-3">
            {task.comments.map((item) => {
              const author = users.find((user) => user.id === item.authorId);
              return (
                <div key={item.id} className="flex gap-3">
                  <Avatar initials={author?.initials ?? "?"} size="sm" />
                  <div>
                    <p className="text-xs text-faint">{author?.name}</p>
                    <p className="text-ink">{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!comment.trim()) return;
              addComment(task.id, comment);
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
