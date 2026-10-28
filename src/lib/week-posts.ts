import { endOfWeek, startOfDay, startOfWeek } from "date-fns";
import { parseDate } from "./dates";

type WeekTask = {
  id: string;
  parentId?: string | null;
  status: string;
  dueDate?: string | null;
};

export function tasksLeavingThisWeek<T extends WeekTask>(tasks: T[], today = new Date()): T[] {
  const day = startOfDay(today);
  const weekStart = startOfWeek(day, { weekStartsOn: 1 });
  const weekEnd = startOfDay(endOfWeek(day, { weekStartsOn: 1 }));
  return tasks
    .filter((task) => {
      if (task.id.startsWith("hist-") || task.status === "done" || !task.dueDate) return false;
      const due = startOfDay(parseDate(task.dueDate));
      return due >= weekStart && due <= weekEnd;
    })
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
}
