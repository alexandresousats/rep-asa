"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, format, isSameMonth, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/cn";
import { isSameDate, monthGrid, WEEKDAYS } from "@/lib/dates";
import type { Tag, Task } from "@/lib/types";

export function MonthCalendar({
  month,
  onMonthChange,
  tasks,
  tags,
  selectedId,
  onSelect,
}: {
  month: Date;
  onMonthChange: (date: Date) => void;
  tasks: Task[];
  tags: Tag[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const days = monthGrid(month);
  const today = startOfToday();

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, -1))}
            className="rounded-full p-2 text-faint hover:bg-hover hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="min-w-48 text-center text-sm capitalize text-ink">
            {format(month, "MMMM 'de' yyyy", { locale: ptBR })}
          </h2>
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, 1))}
            className="rounded-full p-2 text-faint hover:bg-hover hover:text-ink"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onMonthChange(startOfToday())}
          className="rounded-full border border-line px-3 py-1 text-xs text-faint hover:text-ink"
        >
          Hoje
        </button>
      </div>

      <div className="grid grid-cols-7 border-t border-l border-line">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="border-b border-r border-line px-3 py-2 text-xs text-faint"
          >
            {day}
          </div>
        ))}
        {days.map((day) => {
          const dayTasks = tasks.filter(
            (task) => task.dueDate && isSameDate(task.dueDate, day),
          );
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-32 border-b border-r border-line p-2",
                !isSameMonth(day, month) && "opacity-40",
              )}
            >
              <div
                className={cn(
                  "mb-2 text-xs text-faint",
                  isSameDate(day, today) &&
                    "inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink text-base",
                )}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayTasks.map((task) => {
                  const tag = tags.find((item) => item.id === task.tagIds[0]);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onSelect(task.id)}
                      className={cn(
                        "block w-full truncate rounded-md px-2 py-1 text-left text-[11px] text-ink",
                        selectedId === task.id && "ring-1 ring-ink",
                      )}
                      style={{
                        backgroundColor: tag ? `${tag.color}33` : "var(--bg-hover)",
                      }}
                    >
                      {task.title}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
