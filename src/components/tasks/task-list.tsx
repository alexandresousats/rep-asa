"use client";

import { Check, GripVertical } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { TagChip } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { EditableTitle } from "@/components/tasks/editable-title";
import { PriorityLabel } from "@/components/tasks/priority-label";
import { TaskColumnFilters } from "@/components/tasks/task-filters";
import { setTaskStatus, updateTask } from "@/lib/api";
import { useAccess } from "@/lib/workspace";
import { EMPTY_FILTERS, filterTasks, isFiltering, type TaskFilterState } from "@/lib/task-filters";
import type { Project, Tag, Task, User } from "@/lib/types";

export function SubtaskMark() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 shrink-0 rounded-bl-[3px] border-b border-l border-current text-faint"
    />
  );
}

export function TaskList({
  tasks,
  users,
  tags,
  selectedId,
  onSelect,
  onReorder,
}: {
  tasks: Task[];
  users: User[];
  tags: Tag[];
  projects?: Project[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onReorder?: (ids: string[]) => void;
}) {
  const { canWrite } = useAccess();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [filters, setFilters] = useState<TaskFilterState>(EMPTY_FILTERS);
  const filtering = isFiltering(filters);
  const visible = filterTasks(tasks, filters, "tree");
  const people = users
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const roots = visible
    .filter((task) => !task.parentId)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const rows = roots.flatMap((task) => [
    task,
    ...visible.filter((child) => child.parentId === task.id),
  ]);

  function move(sourceId: string, targetId: string) {
    if (!sourceId || sourceId === targetId) return;
    const ids = roots.map((task) => task.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onReorder?.(next);
  }

  return (
    <div className="min-w-[640px]">
      <div className="grid grid-cols-[1fr_180px_140px_150px] gap-3 border-b border-line-subtle px-4 py-3 text-xs text-faint">
        <span>Nome</span>
        <TaskColumnFilters users={people} filters={filters} onChange={setFilters} />
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-faint">
          {filtering ? "Nenhuma tarefa com esses filtros." : "Nenhuma tarefa nesta sessão."}
        </p>
      ) : null}
      {rows.map((task) => {
        const assignee = users.find((user) => user.id === task.assigneeId);
        const taskTags = tags.filter((tag) => task.tagIds.includes(tag.id));
        const dropId = task.parentId ?? task.id;
        return (
          <div
            key={task.id}
            data-task-row
            role="button"
            tabIndex={0}
            draggable={Boolean(onReorder) && canWrite && !filtering && !task.parentId}
            onDragStart={(event) => {
              if (task.parentId) return;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", task.id);
              setDragId(task.id);
            }}
            onClick={() => onSelect(task.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSelect(task.id);
            }}
            onDragOver={(event) => {
              if (!dragId) return;
              event.preventDefault();
              setOverId(dropId);
            }}
            onDrop={(event) => {
              event.preventDefault();
              move(event.dataTransfer.getData("text/plain") || dragId || "", dropId);
              setDragId(null);
              setOverId(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            className={cn(
              "grid w-full grid-cols-[1fr_180px_140px_150px] items-center gap-3 border-b border-line-subtle px-4 py-3 text-left text-sm hover:bg-hover",
              selectedId === task.id && "bg-elevated",
              task.status === "done" && dragId !== task.id && "opacity-50",
              dragId === task.id && "opacity-40",
              overId === task.id && dragId && dragId !== task.id && "bg-hover",
            )}
          >
            <span
              className={cn(
                "flex min-w-0 items-center gap-3",
                task.parentId && "pl-6",
              )}
            >
              {task.parentId ? (
                <SubtaskMark />
              ) : (
                <span
                  aria-hidden
                  className="cursor-grab text-faint"
                >
                  <GripVertical className="h-4 w-4" strokeWidth={1.5} />
                </span>
              )}
              <span
                onClick={(event) => {
                  event.stopPropagation();
                  if (!canWrite) return;
                  setTaskStatus(task.id, task.status === "done" ? "todo" : "done");
                }}
              >
                {task.status === "done" ? (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : (
                  <span className="inline-flex h-4 w-4 rounded-full border border-line" />
                )}
              </span>
              <EditableTitle
                title={task.title}
                className={cn(
                  "min-w-0 truncate",
                  task.status === "done" && "text-faint line-through",
                )}
                onCommit={(title) => {
                  if (canWrite) updateTask(task.id, { title });
                }}
              />
              <span className="hidden gap-1 lg:flex">
                {taskTags.map((tag) => (
                  <TagChip key={tag.id} name={tag.name} color={tag.color} />
                ))}
              </span>
            </span>
            <span className="flex items-center gap-2 text-muted">
              {assignee ? (
                <>
                  <Avatar initials={assignee.initials} src={assignee.avatar} name={assignee.name} size="sm" />
                  <span className="truncate">{assignee.name.split(" ")[0]}</span>
                </>
              ) : (
                "—"
              )}
            </span>
            <span className="text-muted">{task.dueDate ? formatDay(task.dueDate) : "—"}</span>
            <PriorityLabel priority={task.priority} />
          </div>
        );
      })}
    </div>
  );
}
