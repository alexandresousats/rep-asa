"use client";

import { addDays, differenceInCalendarDays, min, max, parseISO } from "date-fns";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/cn";
import { toISODate } from "@/lib/dates";
import type { Tag, Task } from "@/lib/types";

export function ProjectTimeline({
  tasks,
  tags,
  selectedId,
  onSelect,
}: {
  tasks: Task[];
  tags: Tag[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const dated = tasks.filter((task) => task.dueDate);
  if (dated.length === 0) {
    return <p className="px-6 py-10 text-sm text-faint">Nenhuma tarefa com data.</p>;
  }

  const starts = dated.map((task) => parseISO(task.startDate ?? task.dueDate as string));
  const ends = dated.map((task) => parseISO(task.dueDate as string));
  const rangeStart = addDays(min(starts), -2);
  const rangeEnd = addDays(max(ends), 4);
  const totalDays = Math.max(differenceInCalendarDays(rangeEnd, rangeStart), 14);
  const ticks = Array.from({ length: totalDays + 1 }, (_, index) =>
    addDays(rangeStart, index),
  );

  return (
    <div className="overflow-x-auto px-6 py-4">
      <div style={{ minWidth: totalDays * 28 }}>
        <div className="mb-4 flex text-[10px] text-faint">
          {ticks.map((tick) => (
            <div key={tick.toISOString()} className="w-7 shrink-0">
              {tick.getDate() === 1 || tick.getDate() % 5 === 0
                ? format(tick, "d MMM", { locale: ptBR })
                : ""}
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {dated.map((task) => {
            const start = parseISO(task.startDate ?? task.dueDate as string);
            const end = parseISO(task.dueDate as string);
            const offset = differenceInCalendarDays(start, rangeStart);
            const span = Math.max(differenceInCalendarDays(end, start) + 1, 1);
            const tag = tags.find((item) => item.id === task.tagIds[0]);
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => onSelect(task.id)}
                className="flex w-full items-center gap-4 text-left"
              >
                <span className="w-64 shrink-0 truncate text-sm text-ink">
                  {task.title}
                </span>
                <div className="relative h-8 flex-1">
                  <div
                    className={cn(
                      "absolute top-1 h-6 rounded-full px-3 text-[11px] leading-6 text-ink",
                      selectedId === task.id && "ring-1 ring-ink",
                    )}
                    style={{
                      left: offset * 28,
                      width: span * 28,
                      backgroundColor: tag ? `${tag.color}44` : "var(--bg-hover)",
                    }}
                  >
                    {toISODate(end).slice(8)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
