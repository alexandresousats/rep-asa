"use client";

import { Check, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { PriorityLabel } from "@/components/tasks/priority-label";
import { Avatar } from "@/components/ui/avatar";
import { TagChip } from "@/components/ui/badge";
import { setTaskStatus, reorderTasks, updateTask } from "@/lib/api";
import { useAccess } from "@/lib/workspace";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import type { Tag, Task, User } from "@/lib/types";

export function TaskKanban({
  sections,
  tasks,
  users,
  tags,
  selectedId,
  onSelect,
  onCreate,
  draggable = true,
}: {
  sections: string[];
  tasks: Task[];
  users: User[];
  tags: Tag[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onCreate: (section: string) => void;
  draggable?: boolean;
}) {
  const { canWrite } = useAccess();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overSection, setOverSection] = useState<string | null>(null);
  const [overTaskId, setOverTaskId] = useState<string | null>(null);
  const dragged = useRef(false);

  function columnTasks(section: string) {
    return tasks
      .filter((task) => !task.parentId && task.section === section)
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  function move(sourceId: string, section: string, beforeId: string | null) {
    const source = tasks.find((task) => task.id === sourceId);
    if (!source || source.parentId) return;
    const column = columnTasks(section).filter((task) => task.id !== sourceId);
    const index = beforeId ? column.findIndex((task) => task.id === beforeId) : column.length;
    column.splice(index < 0 ? column.length : index, 0, source);
    if (source.section !== section) {
      updateTask(sourceId, { section });
      tasks
        .filter((task) => task.parentId === sourceId)
        .forEach((child) => updateTask(child.id, { section }));
    }
    reorderTasks(column.map((task) => task.id));
  }

  function clearDrag() {
    setDragId(null);
    setOverSection(null);
    setOverTaskId(null);
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto px-6 py-4">
      {sections.map((section) => {
        const cards = columnTasks(section);
        const active = dragId !== null && overSection === section;
        return (
          <section
            key={section}
            onDragOver={(event) => {
              if (!dragId) return;
              event.preventDefault();
              setOverSection(section);
              if (event.target === event.currentTarget) setOverTaskId(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = event.dataTransfer.getData("text/plain") || dragId || "";
              move(sourceId, section, overTaskId);
              clearDrag();
            }}
            className={cn(
              "flex h-full w-72 shrink-0 flex-col rounded-2xl bg-elevated",
              active && "ring-1 ring-line",
            )}
          >
            <header className="flex items-center gap-2 px-3 py-3">
              <h2 className="min-w-0 flex-1 truncate text-sm text-ink">{section}</h2>
              <span className="text-xs text-faint">{cards.length}</span>
              <button
                type="button"
                aria-label={`Adicionar tarefa em ${section}`}
                onClick={() => onCreate(section)}
                className="rounded-full p-1 text-faint hover:bg-hover hover:text-ink"
              >
                <Plus className="h-4 w-4" />
              </button>
            </header>
            <div
              className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-3"
              onDragOver={(event) => {
                if (!dragId) return;
                event.preventDefault();
                setOverSection(section);
                if (event.target === event.currentTarget) setOverTaskId(null);
              }}
            >
              {cards.map((task) => {
                const assignee = users.find((user) => user.id === task.assigneeId);
                const taskTags = tags.filter((tag) => task.tagIds.includes(tag.id));
                const subtasks = tasks.filter((item) => item.parentId === task.id);
                const showMarker = active && overTaskId === task.id && dragId !== task.id;
                return (
                  <article
                    key={task.id}
                    draggable={draggable}
                    onDragStart={(event) => {
                      if (!draggable) {
                        event.preventDefault();
                        return;
                      }
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", task.id);
                      setDragId(task.id);
                    }}
                    onDragOver={(event) => {
                      if (!dragId || dragId === task.id) return;
                      event.preventDefault();
                      event.stopPropagation();
                      setOverSection(section);
                      setOverTaskId(task.id);
                    }}
                    onDragEnd={() => {
                      clearDrag();
                      dragged.current = true;
                      window.setTimeout(() => {
                        dragged.current = false;
                      }, 0);
                    }}
                    onClick={() => {
                      if (dragged.current) return;
                      onSelect(task.id);
                    }}
                    className={cn(
                      "rounded-2xl bg-base px-3.5 py-3.5",
                      draggable && "cursor-grab active:cursor-grabbing",
                      selectedId === task.id && "ring-1 ring-ink",
                      task.status === "done" && dragId !== task.id && "opacity-50",
                      dragId === task.id && "opacity-40",
                      showMarker && "ring-1 ring-line",
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <button
                        type="button"
                        aria-label={task.status === "done" ? "Reabrir tarefa" : "Concluir tarefa"}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!canWrite) return;
                          setTaskStatus(task.id, task.status === "done" ? "todo" : "done");
                        }}
                        className="mt-0.5 shrink-0"
                      >
                        {task.status === "done" ? (
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                        ) : (
                          <span className="inline-flex h-4 w-4 rounded-full border border-line" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "text-sm leading-5 text-ink",
                            task.status === "done" && "text-faint line-through",
                          )}
                        >
                          {task.title}
                        </p>
                      </div>
                    </div>
                    {taskTags.length > 0 ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {taskTags.map((tag) => (
                          <TagChip key={tag.id} name={tag.name} color={tag.color} />
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex items-center gap-2 text-xs text-faint">
                      {assignee ? (
                        <Avatar
                          initials={assignee.initials}
                          src={assignee.avatar}
                          name={assignee.name}
                          size="sm"
                        />
                      ) : null}
                      <span className="truncate">
                        {task.dueDate ? formatDay(task.dueDate) : "Sem data"}
                      </span>
                      {subtasks.length > 0 ? (
                        <span>
                          {subtasks.filter((item) => item.status === "done").length}/{subtasks.length}
                        </span>
                      ) : null}
                      <span className="ml-auto shrink-0">
                        <PriorityLabel priority={task.priority} />
                      </span>
                    </div>
                  </article>
                );
              })}
              {cards.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-faint">Nenhuma tarefa</p>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
