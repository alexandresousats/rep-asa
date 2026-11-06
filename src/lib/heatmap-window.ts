import { eachDayOfInterval, endOfWeek, startOfWeek, subWeeks } from "date-fns";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Últimas 52 semanas atrás da semana atual, alinhadas no domingo (gráfico do GitHub). */
export const HEATMAP_WEEKS = 52;

export function heatmapInterval(today = new Date()) {
  const anchor = startOfDay(today);
  const start = startOfWeek(subWeeks(anchor, HEATMAP_WEEKS), { weekStartsOn: 0 });
  const end = endOfWeek(anchor, { weekStartsOn: 0 });
  return eachDayOfInterval({ start, end });
}

/** Ano atual: janela rolante até a semana de hoje. Outro ano: ano civil completo. */
export function deliveryHeatmapDays(year: number, today = new Date()) {
  if (year === today.getFullYear()) return heatmapInterval(today);
  return heatmapYearInterval(year);
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
