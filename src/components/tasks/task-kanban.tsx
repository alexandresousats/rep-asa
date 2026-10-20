"use client";

import { Check, GripVertical, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { PriorityLabel } from "@/components/tasks/priority-label";
import { Avatar } from "@/components/ui/avatar";
import { TagChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { deleteSection, reorderSections, setTaskStatus, reorderTasks, updateTask } from "@/lib/api";
import { useAccess } from "@/lib/workspace";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import type { Tag, Task, User } from "@/lib/types";

export function TaskKanban({
  projectId,
  sections,
  tasks,
  users,
  tags,
  selectedId,
  onSelect,
  onCreate,
  draggable = true,
}: {
  projectId: string;
  sections: string[];
  tasks: Task[];
  users: User[];
  tags: Tag[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onCreate: (section: string) => void;
  draggable?: boolean;
}) {
  const { canWrite, isAdmin } = useAccess();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overSection, setOverSection] = useState<string | null>(null);
  const [overTaskId, setOverTaskId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [draggingSection, setDraggingSection] = useState<string | null>(null);
  const [sectionDropAt, setSectionDropAt] = useState<number | null>(null);
  const sectionDrag = useRef<string | null>(null);
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

  function placeSection(section: string, clientX: number, rect: DOMRect) {
    const source = sectionDrag.current;
    if (!source) return;
    const index = sections.indexOf(section);
    const after = clientX > rect.left + rect.width / 2;
    moveSection(sections, projectId, source, after ? index + 1 : index);
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto px-6 py-4">
      {sections.map((section, index) => {
        const cards = columnTasks(section);
        const active = dragId !== null && overSection === section;
        const canOrder = isAdmin && sections.length > 1;
        return (
          <section
            key={section}
            onDragOver={(event) => {
              if (sectionDrag.current) {
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                const after = event.clientX > rect.left + rect.width / 2;
                setSectionDropAt(after ? index + 1 : index);
                return;
              }
              if (!dragId) return;
              event.preventDefault();
              setOverSection(section);
              if (event.target === event.currentTarget) setOverTaskId(null);
            }}
            onDrop={(event) => {
              if (sectionDrag.current) {
                event.preventDefault();
                placeSection(section, event.clientX, event.currentTarget.getBoundingClientRect());
                sectionDrag.current = null;
                setDraggingSection(null);
                setSectionDropAt(null);
                return;
              }
              event.preventDefault();
              const sourceId = event.dataTransfer.getData("text/plain") || dragId || "";
              move(sourceId, section, overTaskId);
              clearDrag();
            }}
            className={cn(
              "flex h-full w-72 shrink-0 flex-col rounded-2xl bg-elevated",
              active && "ring-1 ring-line",
              draggingSection === section && "opacity-40",
              sectionDropAt === index && draggingSection && "ring-1 ring-ink",
            )}
          >
            <header className="flex items-center gap-2 px-3 py-3">
              {canOrder ? (
                <span
                  draggable
                  role="button"
                  tabIndex={0}
                  aria-label={`Mover ${section}`}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", section);
                    sectionDrag.current = section;
                    setDraggingSection(section);
                  }}
                  onDragEnd={() => {
                    sectionDrag.current = null;
                    setDraggingSection(null);
                    setSectionDropAt(null);
                  }}
                  className="cursor-grab text-faint active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" strokeWidth={1.5} />
                </span>
              ) : null}
              <h2 className="min-w-0 flex-1 truncate text-sm text-ink">{section}</h2>
              <span className="text-xs text-faint">{cards.length}</span>
              {isAdmin && sections.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Excluir ${section}`}
                  onClick={() => {
                    setDeleteError("");
                    setPendingDelete(section);
                  }}
                  className="rounded-full p-1 text-faint hover:bg-hover hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
              {canWrite ? (
                <button
                  type="button"
                  aria-label={`Adicionar tarefa em ${section}`}
                  onClick={() => onCreate(section)}
                  className="rounded-full p-1 text-faint hover:bg-hover hover:text-ink"
                >
                  <Plus className="h-4 w-4" />
                </button>
              ) : null}
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
      <Dialog
        open={pendingDelete !== null}
        title="Excluir sessão"
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
      >
        <SectionDeleteCopy name={pendingDelete} sections={sections} tasks={tasks} />
        {deleteError ? <p className="mt-3 text-sm text-red-400">{deleteError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={deleting}
            onClick={() => setPendingDelete(null)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={deleting || !pendingDelete}
            onClick={() => {
              if (!pendingDelete) return;
              const name = pendingDelete;
              setDeleting(true);
              setDeleteError("");
              void deleteSection(projectId, name).then((result) => {
                setDeleting(false);
                if (!result.ok) {
                  setDeleteError(result.error);
                  return;
                }
                setPendingDelete(null);
              });
            }}
          >
            Excluir
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function moveSection(sections: string[], projectId: string, source: string, index: number) {
  const from = sections.indexOf(source);
  if (from < 0) return;
  const target = index > from ? index - 1 : index;
  if (target === from) return;
  const next = [...sections];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  reorderSections(projectId, next);
}

function SectionDeleteCopy({
  name,
  sections,
  tasks,
}: {
  name: string | null;
  sections: string[];
  tasks: Task[];
}) {
  if (!name) return null;
  const index = sections.indexOf(name);
  const fallback = sections[index - 1] ?? sections[index + 1] ?? "";
  const count = tasks.filter((task) => task.section === name).length;
  return (
    <p className="text-sm leading-6 text-faint">
      {count > 0
        ? `${name} será excluída. ${count === 1 ? "A tarefa desta sessão passa" : `As ${count} tarefas desta sessão passam`} para ${fallback}.`
        : `${name} será excluída.`}
    </p>
  );
}
