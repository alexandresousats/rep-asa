"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/cn";
import { parseDate, toISODate } from "@/lib/dates";
import { isFutureHeatmapDay } from "@/lib/heatmap-window";
import type { HeatmapCell } from "@/lib/types";

function intensity(count: number) {
  if (count <= 0) return "bg-hover";
  if (count === 1) return "bg-heat-1";
  if (count === 2) return "bg-heat-2";
  if (count <= 4) return "bg-heat-3";
  return "bg-heat-4";
}

function monthShort(day: Date) {
  return format(day, "MMM", { locale: ptBR }).replace(/\./g, "");
}

const LEGEND_LEVELS = [0, 1, 2, 3, 4] as const;

export function Heatmap({ cells }: { cells: HeatmapCell[] }) {
  const today = new Date();
  const lookup = new Map(cells.map((cell) => [cell.date, cell.count]));
  const days = cells.map((cell) => parseDate(cell.date));
  const weekCount = Math.ceil(days.length / 7);
  const weekColumns = `repeat(${weekCount}, minmax(0, 1fr))`;

  const monthLabels: { week: number; label: string }[] = [];
  let lastMonth = -1;
  let lastYear = -1;
  for (let week = 0; week < weekCount; week += 1) {
    const sunday = days[week * 7];
    if (!sunday || isFutureHeatmapDay(sunday, today)) continue;
    const month = sunday.getMonth();
    const year = sunday.getFullYear();
    if (month === lastMonth && year === lastYear) continue;
    lastMonth = month;
    lastYear = year;
    monthLabels.push({ week, label: monthShort(sunday) });
  }

  return (
    <div className="w-full min-w-0">
      <div
        className="mb-1.5 grid w-full gap-[2px] text-[10px] text-faint sm:gap-[3px] sm:text-[11px]"
        style={{ gridTemplateColumns: weekColumns }}
      >
        {Array.from({ length: weekCount }, (_, week) => {
          const marker = monthLabels.find((item) => item.week === week);
          return (
            <span key={week} className="leading-none capitalize">
              {marker?.label ?? ""}
            </span>
          );
        })}
      </div>
      <div
        className="grid h-[88px] w-full gap-[2px] sm:h-[98px] sm:gap-[3px]"
        style={{
          gridTemplateColumns: weekColumns,
          gridTemplateRows: "repeat(7, minmax(0, 1fr))",
          gridAutoFlow: "column",
        }}
      >
        {days.map((day, index) => {
          const key = `${toISODate(day)}-${index}`;
          const dateKey = toISODate(day);
          const future = isFutureHeatmapDay(day, today);
          const visible = !future;
          const count = visible ? (lookup.get(dateKey) ?? 0) : 0;
          return (
            <span
              key={key}
              title={
                visible
                  ? `${format(day, "d MMM yyyy", { locale: ptBR })} · ${count} entrega${count === 1 ? "" : "s"}`
                  : undefined
              }
              className={cn(
                "block size-full min-h-0 min-w-0 rounded-[2px]",
                visible ? intensity(count) : "bg-transparent",
              )}
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10px] text-faint sm:text-[11px]">
        <span>Menos</span>
        <div className="flex items-center gap-[2px] sm:gap-[3px]">
          {LEGEND_LEVELS.map((level) => (
            <span
              key={level}
              className={cn(
                "h-2 w-2 rounded-[2px] sm:h-[9px] sm:w-[9px]",
                intensity(level),
              )}
            />
          ))}
        </div>
        <span>Mais</span>
      </div>
    </div>
  );
}
