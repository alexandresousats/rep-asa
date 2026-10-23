"use client";

import { Check, GripVertical, Plus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PriorityLabel } from "@/components/tasks/priority-label";
import { TaskApprovalBadge, TaskFormatBadge } from "@/components/tasks/task-approval-badge";
import { Avatar } from "@/components/ui/avatar";
import { TagChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { deleteSection, reorderSections, setTaskStatus, reorderTasks, updateTask } from "@/lib/api";
import { useAccess } from "@/lib/workspace";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import type { Tag, Task, User } from "@/lib/types";

type ColumnGesture = {
  name: string;
  fromIndex: number;
  startX: number;
  startScroll: number;
  stride: number;
  pointerId: number;
  active: boolean;
  dest: number;
};

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
  const dragged = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const columnRefs = useRef(new Map<string, HTMLElement>());
  const columnDrag = useRef<ColumnGesture | null>(null);
  const scrollRaf = useRef(0);
  const pointerX = useRef(0);
  const motionGen = useRef(0);
  const pendingClear = useRef(false);
  const suppressClick = useRef(false);
  const settling = useRef(false);
  const [columnDragName, setColumnDragName] = useState<string | null>(null);

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

  function clearColumnMotion(animate: boolean) {
    const gen = ++motionGen.current;
    columnRefs.current.forEach((el) => {
      el.style.transition = animate ? "transform 180ms ease-out" : "";
      el.style.transform = "";
      el.style.zIndex = "";
      el.style.boxShadow = "";
    });
    if (!animate) return;
    window.setTimeout(() => {
      if (motionGen.current !== gen) return;
      columnRefs.current.forEach((el) => {
        el.style.transition = "";
      });
    }, 200);
  }

  function applyColumnDrag(clientX: number) {
    const drag = columnDrag.current;
    const board = boardRef.current;
    if (!drag?.active || !board) return;
    const base = board.getBoundingClientRect().left - board.scrollLeft;
    const centers = sections.map((name) => {
      const el = columnRefs.current.get(name);
      if (!el) return 0;
      return base + el.offsetLeft + el.offsetWidth / 2;
    });
    drag.dest = destinationIndex(clientX, drag.fromIndex, centers);
    const deltaX = clientX - drag.startX + (board.scrollLeft - drag.startScroll);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sections.forEach((name, index) => {
      const el = columnRefs.current.get(name);
      if (!el) return;
      const dragging = name === drag.name;
      const shift = columnTranslate(index, drag.fromIndex, drag.dest, drag.stride, deltaX);
      el.style.transition = dragging || reduceMotion ? "none" : "transform 200ms ease-out";
      el.style.transform = `translateX(${shift}px)`;
      el.style.zIndex = dragging ? "30" : "";
      el.style.boxShadow = dragging ? "0 18px 40px rgba(0,0,0,0.35)" : "";
    });
  }

  function autoScrollColumns() {
    const drag = columnDrag.current;
    const board = boardRef.current;
    if (!drag?.active || !board) return;
    const rect = board.getBoundingClientRect();
    const edge = 64;
    const x = pointerX.current;
    let speed = 0;
    if (x < rect.left + edge) speed = -Math.max(6, Math.round((edge - (x - rect.left)) / 3));
    else if (x > rect.right - edge) speed = Math.max(6, Math.round((x - (rect.right - edge)) / 3));
    if (speed) {
      board.scrollLeft += speed;
      applyColumnDrag(x);
    }
    scrollRaf.current = requestAnimationFrame(autoScrollColumns);
  }

  function stopColumnDrag(commit: boolean) {
    if (!columnDrag.current && settling.current && !commit) {
      motionGen.current += 1;
      settling.current = false;
      clearColumnMotion(true);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      return;
    }
    const drag = columnDrag.current;
    columnDrag.current = null;
    if (scrollRaf.current) {
      cancelAnimationFrame(scrollRaf.current);
      scrollRaf.current = 0;
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setColumnDragName(null);
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (!drag?.active) return;
    if (!commit || drag.dest === drag.fromIndex) {
      clearColumnMotion(true);
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gen = ++motionGen.current;
    settling.current = true;
    sections.forEach((name, index) => {
      const el = columnRefs.current.get(name);
      if (!el) return;
      const shift =
        index === drag.fromIndex
          ? (drag.dest - drag.fromIndex) * drag.stride
          : columnTranslate(index, drag.fromIndex, drag.dest, drag.stride, 0);
      el.style.transition = reduceMotion ? "none" : "transform 160ms ease-out";
      el.style.transform = `translateX(${shift}px)`;
      el.style.zIndex = "";
      el.style.boxShadow = "";
    });
    window.setTimeout(() => {
      if (motionGen.current !== gen) {
        settling.current = false;
        return;
      }
      const from = sections.indexOf(drag.name);
      const gap = drag.dest > drag.fromIndex ? drag.dest + 1 : drag.dest;
      const target = gap > from ? gap - 1 : gap;
      if (from < 0 || target === from) {
        settling.current = false;
        clearColumnMotion(false);
        return;
      }
      pendingClear.current = true;
      moveSection(sections, projectId, drag.name, gap);
      settling.current = false;
    }, reduceMotion ? 0 : 160);
  }

  function beginColumnDrag(event: React.PointerEvent<HTMLElement>, section: string, index: number) {
    if (settling.current || !isAdmin || sections.length < 2 || event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button")) return;
    const board = boardRef.current;
    const el = columnRefs.current.get(section);
    if (!board || !el) return;
    const neighborName = sections[index + 1] ?? sections[index - 1];
    const neighbor = neighborName ? columnRefs.current.get(neighborName) : undefined;
    const stride = neighbor ? Math.abs(neighbor.offsetLeft - el.offsetLeft) : el.offsetWidth + 12;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer can already be gone if the gesture ended mid-event.
    }
    motionGen.current += 1;
    columnDrag.current = {
      name: section,
      fromIndex: index,
      startX: event.clientX,
      startScroll: board.scrollLeft,
      stride,
      pointerId: event.pointerId,
      active: false,
      dest: index,
    };
  }

  function trackColumnDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = columnDrag.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    pointerX.current = event.clientX;
    if (!drag.active) {
      if (Math.abs(event.clientX - drag.startX) < 6) return;
      drag.active = true;
      suppressClick.current = true;
      setColumnDragName(drag.name);
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      scrollRaf.current = requestAnimationFrame(autoScrollColumns);
    }
    applyColumnDrag(event.clientX);
  }

  function finishColumnDrag(event: React.PointerEvent<HTMLElement>, commit: boolean) {
    const drag = columnDrag.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stopColumnDrag(commit);
  }

  useLayoutEffect(() => {
    if (!pendingClear.current) return;
    pendingClear.current = false;
    clearColumnMotion(false);
  }, [sections]);

  const stopColumnDragRef = useRef(stopColumnDrag);
  stopColumnDragRef.current = stopColumnDrag;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") stopColumnDragRef.current(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  return (
    <div ref={boardRef} className="relative flex h-full gap-3 overflow-x-auto px-6 py-4">
      {sections.map((section, index) => {
        const cards = columnTasks(section);
        const active = dragId !== null && overSection === section;
        const canOrder = isAdmin && sections.length > 1;
        return (
          <section
            key={section}
            ref={(node) => {
              if (node) columnRefs.current.set(section, node);
              else columnRefs.current.delete(section);
            }}
            data-section={section}
            onDragOver={(event) => {
              if (columnDrag.current || !dragId) return;
              event.preventDefault();
              setOverSection(section);
              if (event.target === event.currentTarget) setOverTaskId(null);
            }}
            onDrop={(event) => {
              if (columnDrag.current || !dragId) return;
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
            <header
              className={cn(
                "flex items-center gap-2 px-3 py-3",
                canOrder && "cursor-grab touch-none select-none",
                columnDragName === section && "cursor-grabbing",
              )}
              onPointerDown={(event) => beginColumnDrag(event, section, index)}
              onPointerMove={trackColumnDrag}
              onPointerUp={(event) => finishColumnDrag(event, true)}
              onPointerCancel={(event) => finishColumnDrag(event, false)}
              onClickCapture={(event) => {
                if (!suppressClick.current) return;
                suppressClick.current = false;
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              {canOrder ? (
                <span aria-hidden className="text-faint">
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
                  className="cursor-pointer rounded-full p-1 text-faint hover:bg-hover hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
              {canWrite ? (
                <button
                  type="button"
                  aria-label={`Adicionar tarefa em ${section}`}
                  onClick={() => onCreate(section)}
                  className="cursor-pointer rounded-full p-1 text-faint hover:bg-hover hover:text-ink"
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
                      "cursor-pointer rounded-2xl bg-base px-3.5 py-3.5",
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
                        className="mt-0.5 shrink-0 cursor-pointer"
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
                    {task.demandFormat || (task.approvalStatus && task.approvalStatus !== "none") ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <TaskFormatBadge format={task.demandFormat} />
                        <TaskApprovalBadge status={task.approvalStatus} />
                      </div>
                    ) : null}
                    {taskTags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
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

function destinationIndex(clientX: number, fromIndex: number, centers: number[]) {
  let dest = 0;
  for (let index = 0; index < centers.length; index++) {
    if (index === fromIndex) continue;
    if (clientX > centers[index]) dest += 1;
  }
  return dest;
}

function columnTranslate(
  index: number,
  from: number,
  dest: number,
  stride: number,
  deltaX: number,
) {
  if (index === from) return deltaX;
  if (dest > from && index > from && index <= dest) return -stride;
  if (dest < from && index >= dest && index < from) return stride;
  return 0;
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
