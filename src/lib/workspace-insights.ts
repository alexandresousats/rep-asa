import {
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
} from "date-fns";
import { toISODate } from "./dates";
import type { Project, Task, User } from "./types";

export type InsightPeriod =
  | "all"
  | "today"
  | "week"
  | "month"
  | "30d"
  | "quarter"
  | "year"
  | "custom";

export type DateRange = { start: string | null; end: string | null };

export type InsightBar = {
  id: string;
  label: string;
  value: number;
  color: string;
  href?: string;
  initials?: string;
  avatar?: string | null;
};

export type DueSlice = {
  id: "proximas" | "atrasadas" | "nao" | "concluidas";
  label: string;
  value: number;
  color: string;
};

export type WorkspaceInsights = {
  total: number;
  byProject: InsightBar[];
  openByProject: InsightBar[];
  doneByAssignee: InsightBar[];
  openByAssignee: InsightBar[];
  due: DueSlice[];
};

const MINT = "#5dcaa5";
const BLUE = "#60a5fa";
const PURPLE = "#a78bfa";

const DUE_COLORS = {
  proximas: "#15803d",
  atrasadas: "#4ade80",
  nao: "#5eead4",
  concluidas: "#b7f3e3",
} as const;

export function rangeForPeriod(
  period: InsightPeriod,
  from: string,
  to: string,
  today = new Date(),
): DateRange {
  const day = startOfDay(today);
  if (period === "all") return { start: null, end: null };
  if (period === "today") {
    const key = toISODate(day);
    return { start: key, end: key };
  }
  if (period === "week") {
    return {
      start: toISODate(startOfWeek(day, { weekStartsOn: 1 })),
      end: toISODate(endOfWeek(day, { weekStartsOn: 1 })),
    };
  }
  if (period === "month") {
    return { start: toISODate(startOfMonth(day)), end: toISODate(endOfMonth(day)) };
  }
  if (period === "30d") {
    return { start: toISODate(subDays(day, 29)), end: toISODate(day) };
  }
  if (period === "quarter") {
    return { start: toISODate(startOfQuarter(day)), end: toISODate(endOfQuarter(day)) };
  }
  if (period === "year") {
    return { start: toISODate(startOfYear(day)), end: toISODate(endOfYear(day)) };
  }
  const start = from || null;
  const end = to || null;
  if (start && end && start > end) return { start: end, end: start };
  return { start, end };
}

export function buildWorkspaceInsights(
  tasks: Task[],
  projects: Project[],
  users: User[],
  range: DateRange,
  today = new Date(),
): WorkspaceInsights {
  const todayKey = toISODate(startOfDay(today));
  const scoped = tasks.filter(
    (task) => isWorkTask(task) && taskInPeriod(task, range),
  );
  const open = scoped.filter((task) => task.status !== "done");
  const done = scoped.filter((task) => task.status === "done");

  const projectOf = (id: string) => projects.find((project) => project.id === id);
  const byProject = countBars(
    scoped,
    (task) => task.projectId,
    (id) => {
      const project = projectOf(id);
      return {
        id,
        label: project?.name ?? "Projeto removido",
        color: MINT,
        href: project ? `/projetos/${project.id}` : undefined,
      };
    },
  );
  const openByProject = countBars(
    open,
    (task) => task.projectId,
    (id) => {
      const project = projectOf(id);
      return {
        id,
        label: project?.name ?? "Projeto removido",
        color: project?.color || "#a3a3a3",
        href: project ? `/projetos/${project.id}` : undefined,
      };
    },
  );

  const person = (id: string) => {
    if (id === "none") {
      return { id, label: "Sem responsável", color: BLUE, initials: "—" };
    }
    const user = users.find((item) => item.id === id);
    return {
      id,
      label: user?.name ?? "Ex-membro",
      color: BLUE,
      initials: user?.initials ?? "?",
      avatar: user?.avatar,
    };
  };

  const doneByAssignee = countBars(
    done,
    (task) => task.assigneeId ?? "none",
    (id) => ({ ...person(id), color: BLUE }),
  );
  const openByAssignee = countBars(
    open,
    (task) => task.assigneeId ?? "none",
    (id) => ({ ...person(id), color: PURPLE }),
  );

  const proximas = open.filter((task) => task.dueDate && task.dueDate >= todayKey).length;
  const atrasadas = open.filter((task) => task.dueDate && task.dueDate < todayKey).length;
  const nao = open.filter((task) => !task.dueDate).length;

  return {
    total: scoped.length,
    byProject,
    openByProject,
    doneByAssignee,
    openByAssignee,
    due: [
      { id: "proximas", label: "Próximas", value: proximas, color: DUE_COLORS.proximas },
      { id: "atrasadas", label: "Atrasadas", value: atrasadas, color: DUE_COLORS.atrasadas },
      { id: "nao", label: "Não agendadas", value: nao, color: DUE_COLORS.nao },
      {
        id: "concluidas",
        label: "Concluídas",
        value: done.length,
        color: DUE_COLORS.concluidas,
      },
    ],
  };
}

function isWorkTask(task: Task) {
  return !task.id.startsWith("hist-") && !task.parentId;
}

function dayKey(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return toISODate(date);
}

function covers(key: string | null, range: DateRange) {
  if (!key) return false;
  if (range.start && key < range.start) return false;
  if (range.end && key > range.end) return false;
  return true;
}

function taskInPeriod(task: Task, range: DateRange) {
  if (!range.start && !range.end) return true;
  return (
    covers(dayKey(task.createdAt), range) ||
    covers(task.dueDate, range) ||
    covers(dayKey(task.completedAt), range)
  );
}

function countBars(
  tasks: Task[],
  keyOf: (task: Task) => string,
  meta: (id: string) => Omit<InsightBar, "value">,
) {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const key = keyOf(task);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, value]) => value > 0)
    .map(([id, value]) => ({ ...meta(id), value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"));
}
