import { eachDayOfInterval, endOfWeek, startOfWeek, subWeeks } from "date-fns";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Últimas ~52 semanas, alinhadas no domingo (estilo Grok/GitHub). */
export const HEATMAP_WEEKS = 52;

export function heatmapInterval(today = new Date()) {
  const anchor = startOfDay(today);
  const start = startOfWeek(subWeeks(anchor, HEATMAP_WEEKS), { weekStartsOn: 0 });
  const end = endOfWeek(anchor, { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end });
}

/** Ano civil, com as semanas parciais de janeiro e dezembro. */
export function heatmapYearInterval(year: number) {
  const start = startOfWeek(new Date(year, 0, 1), { weekStartsOn: 0 });
  const end = endOfWeek(new Date(year, 11, 31), { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end });
}

export function isFutureHeatmapDay(day: Date, today = new Date()) {
  return startOfDay(day) > startOfDay(today);
}
