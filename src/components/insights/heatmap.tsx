"use client";

import {
  eachDayOfInterval,
  endOfYear,
  format,
  getMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/cn";
import { toISODate } from "@/lib/dates";
import type { HeatmapCell } from "@/lib/types";

function intensity(count: number) {
  if (count <= 0) return "bg-hover";
  if (count === 1) return "bg-heat-1";
  if (count === 2) return "bg-heat-2";
  if (count <= 4) return "bg-heat-3";
  return "bg-heat-4";
}

export function Heatmap({ cells }: { cells: HeatmapCell[] }) {
  const year = new Date().getFullYear();
  const yearStart = startOfYear(new Date(year, 0, 1));
  const gridStart = startOfWeek(yearStart, { weekStartsOn: 0 });
  const days = eachDayOfInterval({
    start: gridStart,
    end: endOfYear(yearStart),
  });
  const lookup = new Map(cells.map((cell) => [cell.date, cell.count]));
  const weekCount = Math.ceil(days.length / 7);

  const months = Array.from({ length: 12 }, (_, index) =>
    format(new Date(year, index, 1), "LLL", { locale: ptBR }),
  );

  return (
    <div className="overflow-x-auto">
      <div className="mb-3 grid grid-cols-12 text-[11px] capitalize text-faint">
        {months.map((month) => (
          <span key={month}>{month}</span>
        ))}
      </div>
      <div
        className="grid gap-[3px]"
        style={{
          gridTemplateColumns: `repeat(${weekCount}, 10px)`,
          gridTemplateRows: "repeat(7, 10px)",
          gridAutoFlow: "column",
        }}
      >
        {days.map((day) => {
          const key = toISODate(day);
          const inYear = getMonth(day) >= 0 && day.getFullYear() === year;
          const count = inYear ? (lookup.get(key) ?? 0) : 0;
          return (
            <span
              key={key}
              title={
                inYear
                  ? `${format(day, "d MMM", { locale: ptBR })} · ${count}`
                  : ""
              }
              className={cn(
                "h-[10px] w-[10px] rounded-[2px]",
                inYear ? intensity(count) : "bg-transparent",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
