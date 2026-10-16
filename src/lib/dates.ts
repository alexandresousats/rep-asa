import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";

export function parseDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return parseISO(value);
}

export function formatDay(value: string) {
  return format(parseISO(value), "d MMM", { locale: ptBR });
}

export function formatDayLong(value: string) {
  return format(parseISO(value), "d 'de' MMMM", { locale: ptBR });
}

export function formatMonthTitle(date: Date) {
  return format(date, "MMMM 'de' yyyy", { locale: ptBR });
}

export function formatWeekday(date: Date) {
  return format(date, "EEEE", { locale: ptBR });
}

export function toISODate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function monthGrid(date: Date) {
  const start = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(date), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

export function isSameDate(a: string | Date, b: string | Date) {
  const left = typeof a === "string" ? parseISO(a) : a;
  const right = typeof b === "string" ? parseISO(b) : b;
  return isSameDay(left, right);
}

export function daysBetween(start: string, end: string) {
  return differenceInCalendarDays(parseISO(end), parseISO(start));
}

export function addDaysISO(value: string, amount: number) {
  return toISODate(addDays(parseISO(value), amount));
}

export const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
