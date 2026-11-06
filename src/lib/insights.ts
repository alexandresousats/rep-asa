import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseDate, toISODate } from "./dates";
import { deliveryHeatmapDays, heatmapInterval, isFutureHeatmapDay } from "./heatmap-window";
import type { HeatmapCell, InsightStats, Project, Task, User } from "./types";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function computeInsights(
  tasks: Task[],
  projects: Project[],
  users: User[],
  today = new Date(),
): InsightStats {
  const completed = tasks.filter((task) => task.status === "done" && task.completedAt);
  const counts = new Map<string, number>();

  for (const task of completed) {
    const key = task.completedAt as string;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const year = today.getFullYear();
  const monthTotals = new Array(12).fill(0);
  const weekdayTotals = new Array(7).fill(0);

  for (let month = 0; month < 12; month += 1) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = parseDate(toISODate(new Date(year, month, day)));
      const count = counts.get(toISODate(date)) ?? 0;
      monthTotals[month] += count;
      weekdayTotals[date.getDay()] += count;
    }
  }

  const heatmap = heatmapInterval(today).map((day) => {
    const date = toISODate(day);
    if (isFutureHeatmapDay(day, today)) {
      return { date, count: 0 };
    }
    return { date, count: counts.get(date) ?? 0 };
  });

  const mostActiveMonthIndex = monthTotals.indexOf(Math.max(...monthTotals));
  const mostActiveWeekdayIndex = weekdayTotals.indexOf(Math.max(...weekdayTotals));

  const sortedDays = [...counts.keys()].sort();
  let longestStreak = 0;
  let currentRun = 0;
  let previous: string | null = null;

  for (const day of sortedDays) {
    if (!previous) {
      currentRun = 1;
    } else {
      const gap =
        (parseDate(day).getTime() - parseDate(previous).getTime()) / 86_400_000;
      currentRun = gap === 1 ? currentRun + 1 : 1;
    }
    longestStreak = Math.max(longestStreak, currentRun);
    previous = day;
  }

  let currentStreak = 0;
  const cursor = startOfDay(today);
  while (true) {
    const key = toISODate(cursor);
    if ((counts.get(key) ?? 0) > 0) {
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  const projectProgress = projects.map((project) => {
    const items = tasks.filter(
      (task) =>
        task.projectId === project.id &&
        !task.id.startsWith("hist-") &&
        !task.parentId,
    );
    const done = items.filter((task) => task.status === "done").length;
    return {
      projectId: project.id,
      percent: items.length === 0 ? 0 : Math.round((done / items.length) * 100),
    };
  });

  const todayStart = startOfDay(today);

  const memberLoad = users.map((user) => {
    const assigned = tasks.filter(
      (task) => task.assigneeId === user.id && !task.id.startsWith("hist-"),
    );
    return {
      userId: user.id,
      done: assigned.filter((task) => task.status === "done").length,
      open: assigned.filter((task) => task.status !== "done").length,
      overdue: assigned.filter((task) => {
        if (!task.dueDate || task.status === "done") return false;
        const [year, month, day] = task.dueDate.split("-").map(Number);
        return new Date(year, month - 1, day) < todayStart;
      }).length,
    };
  });

  return {
    totalCompleted: completed.length,
    mostActiveMonth: format(new Date(year, mostActiveMonthIndex, 1), "MMMM", {
      locale: ptBR,
    }),
    mostActiveWeekday: format(new Date(2026, 0, 4 + mostActiveWeekdayIndex), "EEEE", {
      locale: ptBR,
    }),
    longestStreak,
    currentStreak,
    heatmap,
    projectProgress,
    memberLoad,
  };
}

function completionDay(value: string) {
  return value.slice(0, 10);
}

export function deliveryYears(tasks: Task[], today = new Date()) {
  const years = new Set<number>([today.getFullYear()]);
  for (const task of tasks) {
    if (task.status !== "done" || !task.completedAt) continue;
    const year = Number(completionDay(task.completedAt).slice(0, 4));
    if (year >= 2000 && year <= 2100) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

export function deliverySnapshot(tasks: Task[], year: number, today = new Date()) {
  const rolling = year === today.getFullYear();
  const days = deliveryHeatmapDays(year, today);
  const countable = new Set(
    days
      .filter((day) => (rolling ? !isFutureHeatmapDay(day, today) : day.getFullYear() === year))
      .map((day) => toISODate(day)),
  );

  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.status !== "done" || !task.completedAt) continue;
    const key = completionDay(task.completedAt);
    if (!countable.has(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const monthTotals = new Map<string, number>();
  const weekdayTotals = new Array(7).fill(0);
  let totalCompleted = 0;
  for (const day of days) {
    const key = toISODate(day);
    if (!countable.has(key)) continue;
    const count = counts.get(key) ?? 0;
    totalCompleted += count;
    const monthKey = `${day.getFullYear()}-${day.getMonth()}`;
    monthTotals.set(monthKey, (monthTotals.get(monthKey) ?? 0) + count);
    weekdayTotals[day.getDay()] += count;
  }

  const heatmap: HeatmapCell[] = days.map((day) => ({
    date: toISODate(day),
    count: counts.get(toISODate(day)) ?? 0,
  }));

  let mostActiveMonthKey = `${year}-0`;
  let mostActiveTotal = -1;
  for (const [key, total] of monthTotals) {
    if (total > mostActiveTotal) {
      mostActiveTotal = total;
      mostActiveMonthKey = key;
    }
  }
  const [activeYear, activeMonth] = mostActiveMonthKey.split("-").map(Number);
  const mostActiveWeekdayIndex = weekdayTotals.indexOf(Math.max(...weekdayTotals));

  const sortedDays = [...counts.keys()].sort();
  let longestStreak = 0;
  let currentRun = 0;
  let previous: string | null = null;
  for (const day of sortedDays) {
    if (!previous) {
      currentRun = 1;
    } else {
      const gap = (parseDate(day).getTime() - parseDate(previous).getTime()) / 86_400_000;
      currentRun = gap === 1 ? currentRun + 1 : 1;
    }
    longestStreak = Math.max(longestStreak, currentRun);
    previous = day;
  }

  const windowStart = rolling ? startOfDay(days[0]) : new Date(year, 0, 1);
  const windowEnd = rolling ? startOfDay(today) : new Date(year, 11, 31);
  const todayStart = startOfDay(today);
  const cursor = todayStart < windowEnd ? new Date(todayStart) : new Date(windowEnd);
  let currentStreak = 0;
  if (cursor >= windowStart) {
    while (cursor >= windowStart) {
      if ((counts.get(toISODate(cursor)) ?? 0) > 0) {
        currentStreak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
  }

  return {
    totalCompleted,
    mostActiveMonth: format(new Date(activeYear, activeMonth, 1), "MMMM", { locale: ptBR }),
    mostActiveWeekday: format(new Date(2026, 0, 4 + mostActiveWeekdayIndex), "EEEE", {
      locale: ptBR,
    }),
    longestStreak,
    currentStreak,
    heatmap,
  };
}
