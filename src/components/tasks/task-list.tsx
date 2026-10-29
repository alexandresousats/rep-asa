"use client";

import { Check, ChevronDown, GripVertical, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { TagChip } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { EditableTitle } from "@/components/tasks/editable-title";
import { PriorityLabel } from "@/components/tasks/priority-label";
import { TaskApprovalBadge, TaskFormatBadge } from "@/components/tasks/task-approval-badge";
import { TaskColumnFilters } from "@/components/tasks/task-filters";
import {
  createSection,
  createTask,
  deleteSection,
  flushTaskUpdate,
  reorderSections,
  setTaskStatus,
  updateTask,
} from "@/lib/api";
import { useAccess } from "@/lib/workspace";
import { EMPTY_FILTERS, filterTasks, isFiltering, type TaskFilterState } from "@/lib/task-filters";
import {
  beforeIdForRow,
  moveWithinSection,
  planSectionTransfer,
  rootIdsInSection,
  sectionEdgeTarget,
} from "@/lib/task-move";
import type { Project, Tag, Task, User } from "@/lib/types";

const TASK_DRAG_TYPE = "application/x-rep-asa-task";

type TaskDrag = {
  id: string | null;
  idRef: { current: string | null };
  overTaskId: string | null;
  onDragIdChange: (id: string | null) => void;
  onOverTask: (id: string | null) => void;
  onMove: (sourceId: string, overTaskId: string | null, beforeId: string | null) => void;
};

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
  drag,
  showHeader = true,
  filters: controlledFilters,
  onFiltersChange,
  emptyLabel = "Nenhuma tarefa nesta sessão.",
}: {
  tasks: Task[];
  users: User[];
  tags: Tag[];
  projects?: Project[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onReorder?: (ids: string[]) => void;
  drag?: TaskDrag;
  showHeader?: boolean;
  filters?: TaskFilterState;
  onFiltersChange?: (filters: TaskFilterState) => void;
  emptyLabel?: string;
}) {
  const { canWrite } = useAccess();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const activeDragId = drag ? drag.id : dragId;
  const activeOverId = drag ? drag.overTaskId : overId;
  const [localFilters, setLocalFilters] = useState<TaskFilterState>(EMPTY_FILTERS);
  const filters = controlledFilters ?? localFilters;
  const setFilters = onFiltersChange ?? setLocalFilters;
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
    const next = moveWithinSection(
      roots.map((task) => task.id),
      sourceId,
      targetId,
    );
    if (next) onReorder?.(next);
  }

  return (
    <div
      className="min-w-[720px]"
      data-task-list
      onDragOver={(event) => {
        if (!drag?.idRef.current) return;
        event.preventDefault();
      }}
    >
      {showHeader ? (
        <div className="sticky top-0 z-10 grid grid-cols-[1fr_160px_130px_120px_150px] gap-3 border-b border-line-subtle bg-base px-4 py-3 text-xs text-faint">
          <span>Nome</span>
          <TaskColumnFilters users={people} tags={tags} filters={filters} onChange={setFilters} />
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p
          className="px-4 py-8 text-sm text-faint"
          onDragOver={(event) => {
            if (!drag?.idRef.current) return;
            event.preventDefault();
          }}
        >
          {filtering ? "Nenhuma tarefa com esses filtros." : emptyLabel}
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
            data-drop-id={dropId}
            role="button"
            tabIndex={0}
            draggable={Boolean(onReorder) && canWrite && !filtering && !task.parentId}
            onDragStart={(event) => {
              if (task.parentId) return;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", task.id);
              try {
                event.dataTransfer.setData(TASK_DRAG_TYPE, task.id);
              } catch {
                // text/plain already carries the task id.
              }
              if (drag) drag.onDragIdChange(task.id);
              else setDragId(task.id);
            }}
            onClick={() => onSelect(task.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSelect(task.id);
            }}
            onDragOver={(event) => {
              const current = drag?.idRef.current ?? dragId;
              if (!current) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (drag) drag.onOverTask(dropId);
              else setOverId(dropId);
            }}
            onDragLeave={(event) => {
              if (!drag) return;
              const next = event.relatedTarget;
              if (next instanceof Node && event.currentTarget.contains(next)) return;
              if (drag.overTaskId === dropId) drag.onOverTask(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const current = drag?.idRef.current ?? dragId;
              const sourceId =
                event.dataTransfer.getData(TASK_DRAG_TYPE) ||
                event.dataTransfer.getData("text/plain") ||
                current ||
                "";
              const rect = event.currentTarget.getBoundingClientRect();
              const after = event.clientY > rect.top + rect.height / 2;
              const beforeId = beforeIdForRow(
                roots.map((item) => item.id),
                dropId,
                after,
              );
              if (drag) drag.onMove(sourceId, dropId, beforeId);
              else move(sourceId, dropId);
              if (drag) {
                drag.onDragIdChange(null);
                drag.onOverTask(null);
              } else {
                setDragId(null);
                setOverId(null);
              }
            }}
            onDragEnd={() => {
              if (drag) drag.onDragIdChange(null);
              else setDragId(null);
              setOverId(null);
            }}
            className={cn(
              "grid w-full cursor-pointer grid-cols-[1fr_160px_130px_120px_150px] items-center gap-3 border-b border-line-subtle px-4 py-3 text-left text-sm hover:bg-hover",
              selectedId === task.id && "bg-elevated",
              task.status === "done" && activeDragId !== task.id && "opacity-50",
              activeDragId === task.id && "opacity-40",
              activeOverId === task.id && activeDragId && activeDragId !== task.id && "bg-hover",
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
                className="cursor-pointer"
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
              <TaskFormatBadge format={task.demandFormat} />
              <TaskApprovalBadge status={task.approvalStatus} />
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
            <span className="flex flex-wrap items-center gap-1 overflow-hidden">
              {taskTags.length > 0 ? (
                taskTags.map((tag) => (
                  <TagChip key={tag.id} name={tag.name} color={tag.color} />
                ))
              ) : (
                <span className="text-faint text-xs">—</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function GroupedTaskList({
  projectId,
  sections,
  tasks,
  users,
  tags,
  selectedId,
  onSelect,
  onReorder,
  draftSection,
  onDraftSection,
  sectionDraft = false,
  onSectionDraftOpened,
  onFilteredChange,
}: {
  projectId: string;
  sections: string[];
  tasks: Task[];
  users: User[];
  tags: Tag[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onReorder?: (ids: string[]) => void;
  draftSection: string | null;
  onDraftSection: (section: string | null) => void;
  sectionDraft?: boolean;
  onSectionDraftOpened?: () => void;
  onFilteredChange?: (ids: string[] | null) => void;
}) {
  const { canWrite, isAdmin } = useAccess();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filters, setFilters] = useState<TaskFilterState>(EMPTY_FILTERS);
  const [draftKey, setDraftKey] = useState(0);
  const [newSection, setNewSection] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [draggingSection, setDraggingSection] = useState<string | null>(null);
  const [sectionDropAt, setSectionDropAt] = useState<number | null>(null);
  const [taskDragId, setTaskDragId] = useState<string | null>(null);
  const [overTaskId, setOverTaskId] = useState<string | null>(null);
  const [taskOver, setTaskOver] = useState<{ section: string; edge: "start" | "end" } | null>(
    null,
  );
  const sectionDrag = useRef<string | null>(null);
  const taskDragRef = useRef<string | null>(null);
  const taskDropHandled = useRef(false);
  const people = users.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const skipSectionBlur = useRef(false);
  const [prevSectionDraft, setPrevSectionDraft] = useState(sectionDraft);
  if (sectionDraft !== prevSectionDraft) {
    setPrevSectionDraft(sectionDraft);
    if (sectionDraft) {
      setNewSection("");
    }
  }

  useEffect(() => {
    if (sectionDraft) {
      onSectionDraftOpened?.();
    }
  }, [sectionDraft, onSectionDraftOpened]);

  useEffect(() => {
    if (!onFilteredChange) return;
    onFilteredChange(
      isFiltering(filters) ? filterTasks(tasks, filters, "tree").map((task) => task.id) : null,
    );
  }, [tasks, filters, onFilteredChange]);

  async function commitDraft(section: string, title: string, keepOpen: boolean) {
    await createTask({ projectId, title, section });
    if (keepOpen) {
      setDraftKey((key) => key + 1);
      return;
    }
    onDraftSection(null);
  }

  function clearTaskDrag() {
    taskDragRef.current = null;
    setTaskDragId(null);
    setOverTaskId(null);
    setTaskOver(null);
  }

  function dropTask(
    sourceId: string,
    section: string,
    targetTaskId: string | null,
    beforeId: string | null,
  ) {
    if (taskDropHandled.current) return;
    taskDropHandled.current = true;
    if (!onReorder || !sourceId || isFiltering(filters)) return;
    const source = tasks.find((task) => task.id === sourceId);
    if (!source || source.parentId) return;
    if (source.section === section) {
      const orderedIds = moveWithinSection(rootIdsInSection(tasks, section), sourceId, targetTaskId);
      if (orderedIds) onReorder(orderedIds);
      return;
    }
    const plan = planSectionTransfer(tasks, sourceId, section, beforeId);
    if (!plan) return;
    updateTask(plan.sourceId, { section: plan.section, order: plan.order });
    for (const childId of plan.childIds) updateTask(childId, { section: plan.section });
    flushTaskUpdate(plan.sourceId);
    for (const childId of plan.childIds) flushTaskUpdate(childId);
    onReorder(plan.orderedIds);
    setCollapsed((current) =>
      current[plan.section] ? { ...current, [plan.section]: false } : current,
    );
  }

  const pendingCount = pendingDelete
    ? tasks.filter((task) => task.section === pendingDelete && !task.id.startsWith("hist-")).length
    : 0;
  const fallback = pendingDelete ? neighborSection(sections, pendingDelete) : "";

  return (
    <div className="min-w-[720px]">
      <div className="sticky top-0 z-10 grid grid-cols-[1fr_160px_130px_120px_150px] gap-3 border-b border-line-subtle bg-base px-4 py-3 text-xs text-faint">
        <span>Nome</span>
        <TaskColumnFilters users={people} tags={tags} filters={filters} onChange={setFilters} />
      </div>
      {sections.map((section, index) => {
        const open = !collapsed[section];
        const items = tasks.filter((task) => task.section === section);
        const count = items.filter((task) => !task.parentId).length;
        const canOrder = isAdmin && sections.length > 1;
        const showTaskLine =
          Boolean(taskDragId) && taskOver?.section === section && !overTaskId && !draggingSection;
        return (
          <div
            key={section}
            id={`secao-${section}`}
            onDragEnter={(event) => {
              if (sectionDrag.current || !taskDragRef.current || isFiltering(filters)) return;
              event.preventDefault();
            }}
            onDragOver={(event) => {
              if (sectionDrag.current) {
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                const after = event.clientY > rect.top + rect.height / 2;
                setSectionDropAt(after ? index + 1 : index);
                return;
              }
              if (!taskDragRef.current || isFiltering(filters)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              const rootCount = rootIdsInSection(tasks, section).length;
              const edge =
                rootCount === 0 ? "start" : edgeFromPointer(event.currentTarget, event.clientY);
              setTaskOver((current) =>
                current?.section === section && current.edge === edge ? current : { section, edge },
              );
            }}
            onDragLeave={(event) => {
              if (sectionDrag.current) return;
              const next = event.relatedTarget;
              if (next instanceof Node && event.currentTarget.contains(next)) return;
              setTaskOver((current) => (current?.section === section ? null : current));
              setOverTaskId(null);
            }}
            onDrop={(event) => {
              if (sectionDrag.current) {
                event.preventDefault();
                const source = event.dataTransfer.getData("text/plain") || sectionDrag.current;
                const rect = event.currentTarget.getBoundingClientRect();
                const after = event.clientY > rect.top + rect.height / 2;
                moveSection(sections, projectId, source, after ? index + 1 : index);
                sectionDrag.current = null;
                setDraggingSection(null);
                setSectionDropAt(null);
                return;
              }
              if (!taskDragRef.current || isFiltering(filters)) return;
              event.preventDefault();
              const sourceId =
                event.dataTransfer.getData(TASK_DRAG_TYPE) ||
                event.dataTransfer.getData("text/plain") ||
                taskDragRef.current;
              const row =
                event.target instanceof Element ? event.target.closest("[data-task-row]") : null;
              if (row instanceof HTMLElement && event.currentTarget.contains(row)) {
                const overId = row.getAttribute("data-drop-id");
                if (overId) {
                  const rect = row.getBoundingClientRect();
                  const after = event.clientY > rect.top + rect.height / 2;
                  const beforeId = beforeIdForRow(rootIdsInSection(tasks, section), overId, after);
                  dropTask(sourceId, section, overId, beforeId);
                  clearTaskDrag();
                  return;
                }
              }
              const ids = rootIdsInSection(tasks, section);
              const edge =
                ids.length === 0 ? "start" : edgeFromPointer(event.currentTarget, event.clientY);
              const target = sectionEdgeTarget(ids, edge);
              dropTask(sourceId, section, target.overTaskId, target.beforeId);
              clearTaskDrag();
            }}
            className={cn(draggingSection === section && "opacity-40")}
          >
            {sectionDropAt === index && draggingSection ? (
              <div className="mx-4 h-0.5 rounded-full bg-ink" />
            ) : null}
            <div className="flex items-center gap-2 px-4 py-3 hover:bg-hover">
              {canOrder ? (
                <span
                  draggable
                  role="button"
                  tabIndex={0}
                  aria-label={`Mover ${section}`}
                  onDragStart={(event) => {
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
              <button
                type="button"
                onClick={() =>
                  setCollapsed((current) => ({ ...current, [section]: !current[section] }))
                }
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-sm text-ink"
              >
                <ChevronDown
                  className={cn("h-4 w-4 text-faint transition-transform", !open && "-rotate-90")}
                  strokeWidth={1.5}
                />
                <span className="font-medium">{section}</span>
                <span className="text-xs text-faint">{count}</span>
              </button>
              {canOrder ? (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError("");
                    setPendingDelete(section);
                  }}
                  className="shrink-0 cursor-pointer text-xs text-faint hover:text-ink"
                >
                  Excluir
                </button>
              ) : null}
            </div>
            {!open && showTaskLine ? <div className="mx-4 h-0.5 rounded-full bg-ink" /> : null}
            {open ? (
              <>
                {showTaskLine && taskOver?.edge === "start" ? (
                  <div className="mx-4 h-0.5 rounded-full bg-ink" />
                ) : null}
                <TaskList
                  tasks={items}
                  users={users}
                  tags={tags}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onReorder={onReorder}
                  drag={
                    onReorder
                      ? {
                          id: taskDragId,
                          idRef: taskDragRef,
                          overTaskId,
                          onDragIdChange: (id) => {
                            if (!id) {
                              clearTaskDrag();
                              return;
                            }
                            taskDropHandled.current = false;
                            taskDragRef.current = id;
                            setTaskDragId(id);
                          },
                          onOverTask: (id) => {
                            setOverTaskId((current) => (current === id ? current : id));
                          },
                          onMove: (sourceId, targetTaskId, beforeId) => {
                            dropTask(sourceId, section, targetTaskId, beforeId);
                          },
                        }
                      : undefined
                  }
                  showHeader={false}
                  filters={filters}
                  onFiltersChange={setFilters}
                  emptyLabel="Nenhuma tarefa nesta sessão."
                />
                {showTaskLine && taskOver?.edge === "end" ? (
                  <div className="mx-4 h-0.5 rounded-full bg-ink" />
                ) : null}
                {draftSection === section ? (
                  <DraftRow
                    key={draftKey}
                    onCommit={(title, keepOpen) => {
                      void commitDraft(section, title, keepOpen);
                    }}
                    onCancel={() => onDraftSection(null)}
                  />
                ) : canWrite ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCollapsed((current) => ({ ...current, [section]: false }));
                      onDraftSection(section);
                    }}
                    className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm text-faint hover:text-ink"
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.5} />
                    Adicionar tarefa
                  </button>
                ) : null}
              </>
            ) : null}
            {sectionDropAt === sections.length && draggingSection && index === sections.length - 1 ? (
              <div className="mx-4 h-0.5 rounded-full bg-ink" />
            ) : null}
          </div>
        );
      })}
      {isAdmin && newSection !== null ? (
        <form
          className="px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            const name = newSection.trim();
            skipSectionBlur.current = true;
            setNewSection(null);
            if (!name) return;
            void createSection(projectId, name);
          }}
        >
          <input
            autoFocus
            value={newSection}
            aria-label="Nova sessão"
            placeholder="Nova sessão"
            onChange={(event) => setNewSection(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setNewSection(null);
              }
            }}
            onBlur={() => {
              if (skipSectionBlur.current) {
                skipSectionBlur.current = false;
                return;
              }
              const name = newSection.trim();
              setNewSection(null);
              if (!name) return;
              void createSection(projectId, name);
            }}
            className="h-8 w-48 rounded-full bg-elevated px-3 text-sm text-ink outline-none placeholder:text-faint"
          />
        </form>
      ) : null}
      <Dialog
        open={pendingDelete !== null}
        title="Excluir sessão"
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
      >
        <p className="text-sm leading-6 text-faint">
          {pendingCount > 0
            ? `${pendingDelete} será excluída. ${pendingCount === 1 ? "A tarefa desta sessão passa" : `As ${pendingCount} tarefas desta sessão passam`} para ${fallback}.`
            : `${pendingDelete} será excluída.`}
        </p>
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
                if (draftSection === name) onDraftSection(null);
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

function edgeFromPointer(sectionEl: HTMLElement, clientY: number): "start" | "end" {
  const list = sectionEl.querySelector("[data-task-list]");
  if (!(list instanceof HTMLElement)) return "start";
  return clientY <= list.getBoundingClientRect().top ? "start" : "end";
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

function neighborSection(sections: string[], name: string) {
  const index = sections.indexOf(name);
  if (index < 0) return sections[0] ?? "";
  return sections[index - 1] ?? sections[index + 1] ?? "";
}

function DraftRow({
  onCommit,
  onCancel,
}: {
  onCommit: (title: string, keepOpen: boolean) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const skipBlur = useRef(false);

  function commit(keepOpen: boolean) {
    const title = value.trim();
    if (!title) {
      if (!keepOpen) onCancel();
      return;
    }
    setValue("");
    onCommit(title, keepOpen);
  }

  return (
    <form
      className="grid grid-cols-[1fr_160px_130px_120px_150px] items-center gap-3 border-b border-line-subtle px-4 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        skipBlur.current = true;
        commit(true);
      }}
    >
      <span className="flex min-w-0 items-center gap-3 pl-7">
        <span className="inline-flex h-4 w-4 rounded-full border border-line" />
        <input
          autoFocus
          value={value}
          aria-label="Título da tarefa"
          placeholder="Escreva o título"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            skipBlur.current = true;
            onCancel();
          }}
          onBlur={() => {
            if (skipBlur.current) {
              skipBlur.current = false;
              return;
            }
            commit(false);
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
        />
      </span>
    </form>
  );
}
