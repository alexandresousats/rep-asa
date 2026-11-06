"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/cn";
import { parseDate, toISODate } from "@/lib/dates";
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

export function Heatmap({ cells, year }: { cells: HeatmapCell[]; year?: number }) {
  const lookup = new Map(cells.map((cell) => [cell.date, cell.count]));
  const days = cells.map((cell) => parseDate(cell.date));
  const weekCount = Math.max(1, Math.ceil(days.length / 7));
  const weekColumns = `repeat(${weekCount}, minmax(0, 1fr))`;

  const monthLabels: { week: number; label: string }[] = [];
  let lastMonth = -1;
  let lastYear = -1;
  for (let week = 0; week < weekCount; week += 1) {
    const day = days[week * 7];
    if (!day) continue;
    if (year != null && day.getFullYear() !== year) continue;
    const month = day.getMonth();
    const visibleYear = day.getFullYear();
    if (month === lastMonth && visibleYear === lastYear) continue;
    lastMonth = month;
    lastYear = visibleYear;
    monthLabels.push({ week, label: monthShort(day) });
  }

  return (
    <div className="w-full min-w-0">
      <div className="w-full">
        <div
          className="mb-1.5 grid w-full gap-[3px] text-[10px] text-faint sm:text-[11px]"
          style={{ gridTemplateColumns: weekColumns }}
        >
          {Array.from({ length: weekCount }, (_, week) => {
            const marker = monthLabels.find((item) => item.week === week);
            return (
              <span key={week} className="block min-w-0 whitespace-nowrap leading-none capitalize">
                {marker?.label ?? ""}
              </span>
            );
          })}
        </div>
        <div
          className="grid w-full gap-[3px]"
          style={{
            gridTemplateColumns: weekColumns,
            gridTemplateRows: "repeat(7, minmax(0, 1fr))",
            gridAutoFlow: "column",
            aspectRatio: `${weekCount} / 7`,
          }}
        >
          {days.map((day, index) => {
            const dateKey = toISODate(day);
            const count = lookup.get(dateKey) ?? 0;
            return (
              <span
                key={`${dateKey}-${index}`}
                title={`${format(day, "d MMM yyyy", { locale: ptBR })} · ${count} entrega${count === 1 ? "" : "s"}`}
                className={cn("block size-full min-h-0 min-w-0 rounded-[2px]", intensity(count))}
              />
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-1 text-[10px] text-faint sm:text-[11px]">
          <span>Menos</span>
          <div className="flex items-center gap-[3px]">
            {LEGEND_LEVELS.map((level) => (
              <span key={level} className={cn("h-[11px] w-[11px] rounded-[2px]", intensity(level))} />
            ))}
          </div>
          <span>Mais</span>
        </div>
      </div>
    </div>
  );
}
