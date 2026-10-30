import { endOfWeek, startOfDay, startOfWeek } from "date-fns";
import { parseDate } from "./dates";
import type { Priority, Task } from "./types";

export type DateFilter = "all" | "today" | "week" | "overdue" | "undated";

export type TaskFilterState = {
  assignees: string[];
  date: DateFilter;
  priorities: Priority[];
  tags: string[];
  projects: string[];
};

export const EMPTY_FILTERS: TaskFilterState = {
  assignees: [],
  date: "all",
  priorities: [],
  tags: [],
  projects: [],
};

export const DATE_FILTERS: { id: DateFilter; label: string }[] = [
  { id: "all", label: "Qualquer data" },
  { id: "today", label: "Hoje" },
  { id: "week", label: "Esta semana" },
  { id: "overdue", label: "Atrasadas" },
  { id: "undated", label: "Sem data" },
];

const NONE_ASSIGNEE = "none";

export function isFiltering(filters: TaskFilterState) {
  return (
    filters.assignees.length > 0 ||
    filters.date !== "all" ||
    filters.priorities.length > 0 ||
    filters.tags.length > 0 ||
    (filters.projects?.length ?? 0) > 0
  );
}

export function taskMatches(task: Task, filters: TaskFilterState, now = new Date()) {
  if (filters.priorities.length > 0 && !filters.priorities.includes(task.priority)) {
    return false;
  }

  if (filters.assignees.length > 0) {
    const key = task.assigneeId ?? NONE_ASSIGNEE;
    if (!filters.assignees.includes(key)) return false;
  }

  if (filters.tags && filters.tags.length > 0) {
    const hasNone = filters.tags.includes("none");
    const matchesTag = filters.tags.some((tagId) => task.tagIds?.includes(tagId));
    const matchesNone = hasNone && (!task.tagIds || task.tagIds.length === 0);
    if (!matchesTag && !matchesNone) return false;
  }

  if (filters.projects && filters.projects.length > 0 && !filters.projects.includes(task.projectId)) {
    return false;
  }

  if (filters.date === "all") return true;
  if (filters.date === "undated") return !task.dueDate;
  if (!task.dueDate) return false;

  const due = startOfDay(parseDate(task.dueDate));
  const today = startOfDay(now);
  if (filters.date === "today") return due.getTime() === today.getTime();
  if (filters.date === "week") {
    const start = startOfWeek(today, { weekStartsOn: 1 });
    const end = startOfDay(endOfWeek(today, { weekStartsOn: 1 }));
    return due >= start && due <= end;
  }
  return due < today && task.status !== "done";
}

export function filterTasks(
  tasks: Task[],
  filters: TaskFilterState,
  mode: "flat" | "tree" = "flat",
) {
  if (!isFiltering(filters)) return tasks;

  const matching = new Set(
    tasks.filter((task) => taskMatches(task, filters)).map((task) => task.id),
  );
  if (mode === "flat") return tasks.filter((task) => matching.has(task.id));

  const visible = new Set(matching);
  for (const task of tasks) {
    if (matching.has(task.id) && task.parentId) visible.add(task.parentId);
  }
  for (const task of tasks) {
    if (task.parentId && matching.has(task.parentId)) visible.add(task.id);
  }
  return tasks.filter((task) => visible.has(task.id));
}
