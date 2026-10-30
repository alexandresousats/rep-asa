"use client";

import {
  Calendar as CalendarIcon,
  CalendarOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  addDays,
  addMonths,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  isTomorrow,
  startOfToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { monthGrid, parseDate, toISODate, WEEKDAYS } from "@/lib/dates";

export function DatePickerField({
  value,
  onChange,
  ariaLabel,
  emptyLabel = "Sem data",
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  ariaLabel: string;
  emptyLabel?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selectedDate = value ? parseDate(value) : null;
  const label = selectedDate
    ? format(selectedDate, "d 'de' MMM", { locale: ptBR })
    : emptyLabel;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-elevated px-3 text-xs",
          selectedDate ? "text-ink" : "text-faint",
          isOpen && "border-ink/50 ring-1 ring-ink/10",
        )}
      >
        <CalendarIcon className="h-3.5 w-3.5 text-faint" />
        <span>{label}</span>
      </button>
      {isOpen ? (
        <DatePickerMenu
          anchorRef={buttonRef}
          currentDate={selectedDate}
          onClose={() => setIsOpen(false)}
          onSelect={(date) => {
            onChange(date ? toISODate(date) : null);
            setIsOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

export function TaskDatePicker({
  dueDate,
  canWrite,
  onChange,
  variant = "field",
}: {
  dueDate: string | null;
  canWrite: boolean;
  onChange: (dueDate: string | null) => void;
  variant?: "field" | "cell";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isCell = variant === "cell";

  const selectedDate = dueDate ? parseDate(dueDate) : null;
  const today = startOfToday();
  const isOverdue = selectedDate ? isBefore(selectedDate, today) : false;

  let labelText = isCell ? "Sem data" : "Sem data de conclusão";
  if (selectedDate) {
    if (isToday(selectedDate)) {
      labelText = "Hoje";
    } else if (isTomorrow(selectedDate)) {
      labelText = "Amanhã";
    } else {
      labelText = format(selectedDate, isCell ? "d MMM" : "d 'de' MMM", { locale: ptBR });
    }
  }

  if (!canWrite) {
    if (isCell) {
      return (
        <span
          className={cn(
            "px-1.5 text-xs",
            isOverdue && dueDate ? "font-medium text-red-400" : "text-ink",
            !dueDate && "text-faint",
          )}
        >
          {dueDate ? labelText : "—"}
        </span>
      );
    }
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border border-line/60 bg-base/40 px-2.5 py-1 text-xs",
          isOverdue ? "text-amber-500 font-medium" : "text-ink",
          !dueDate && "text-faint",
        )}
      >
        <CalendarIcon className="h-3.5 w-3.5" />
        <span>{labelText}</span>
      </span>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label="Alterar data de conclusão"
        className={cn(
          isCell
            ? "inline-flex max-w-full cursor-pointer items-center rounded-lg border border-transparent px-1.5 py-1 text-xs transition-colors hover:border-line hover:bg-elevated hover:shadow-sm"
            : "group inline-flex items-center gap-2 rounded-xl text-xs transition-all duration-150",
          !isCell &&
            (dueDate
              ? "border border-line/70 bg-base/60 px-2.5 py-1 hover:border-line hover:bg-hover"
              : "border border-dashed border-line/70 bg-base/30 px-2.5 py-1 text-faint hover:border-line-subtle hover:bg-hover hover:text-ink"),
          isCell
            ? isOverdue && dueDate
              ? "font-medium text-red-400"
              : dueDate
                ? "text-ink"
                : "text-faint"
            : isOverdue && dueDate
              ? "border-amber-500/50 text-amber-500 hover:border-amber-500"
              : "text-ink",
          isOpen &&
            (isCell
              ? "border-line bg-elevated shadow-sm"
              : "border-ink/50 bg-hover shadow-sm ring-1 ring-ink/10"),
        )}
      >
        {isCell ? (
          <span className="truncate">{labelText}</span>
        ) : (
          <>
            <CalendarIcon
              className={cn(
                "h-3.5 w-3.5 transition-colors",
                isOverdue ? "text-amber-500" : "text-faint group-hover:text-ink",
              )}
            />
            <span className="font-medium">{labelText}</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-faint transition-transform duration-150 group-hover:text-ink",
                isOpen && "rotate-180",
              )}
            />
          </>
        )}
      </button>

      {isOpen ? (
        <DatePickerMenu
          anchorRef={buttonRef}
          currentDate={selectedDate}
          onClose={() => setIsOpen(false)}
          onSelect={(date) => {
            onChange(date ? toISODate(date) : null);
            setIsOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function DatePickerMenu({
  anchorRef,
  currentDate,
  onClose,
  onSelect,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  currentDate: Date | null;
  onClose: () => void;
  onSelect: (date: Date | null) => void;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [viewMonth, setViewMonth] = useState<Date>(() => currentDate ?? startOfToday());
  const menuRef = useRef<HTMLDivElement>(null);

  const today = startOfToday();
  const tomorrow = addDays(today, 1);
  const nextWeek = addDays(today, 7);
  const days = monthGrid(viewMonth);

  useLayoutEffect(() => {
    function updatePosition() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuWidth = 280;

      let left = rect.right - menuWidth;
      let top = rect.bottom + 6;

      if (left < 8) left = Math.max(8, rect.left);
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }

      const estimatedHeight = 350;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedHeight - 6);
      }

      setCoords({ top, left });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      data-date-picker-menu
      style={{
        top: coords.top,
        left: coords.left,
        width: 280,
      }}
      className="fixed z-[80] rounded-2xl border border-line bg-elevated p-3 shadow-2xl menu-in"
    >
      {/* Quick presets */}
      <div className="grid grid-cols-3 gap-1 pb-2">
        <button
          type="button"
          onClick={() => onSelect(today)}
          className={cn(
            "rounded-xl border px-2 py-1 text-center text-xs transition-colors",
            currentDate && isSameDay(currentDate, today)
              ? "border-ink bg-ink text-base font-medium"
              : "border-line/60 bg-base/60 text-ink hover:border-line hover:bg-hover",
          )}
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={() => onSelect(tomorrow)}
          className={cn(
            "rounded-xl border px-2 py-1 text-center text-xs transition-colors",
            currentDate && isSameDay(currentDate, tomorrow)
              ? "border-ink bg-ink text-base font-medium"
              : "border-line/60 bg-base/60 text-ink hover:border-line hover:bg-hover",
          )}
        >
          Amanhã
        </button>
        <button
          type="button"
          onClick={() => onSelect(nextWeek)}
          className={cn(
            "rounded-xl border px-2 py-1 text-center text-xs transition-colors",
            currentDate && isSameDay(currentDate, nextWeek)
              ? "border-ink bg-ink text-base font-medium"
              : "border-line/60 bg-base/60 text-ink hover:border-line hover:bg-hover",
          )}
        >
          +7 dias
        </button>
      </div>

      {currentDate ? (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line/60 py-1 text-xs text-faint transition-colors hover:border-line hover:bg-hover hover:text-ink"
        >
          <CalendarOff className="h-3.5 w-3.5" />
          <span>Remover data</span>
        </button>
      ) : null}

      <div className="my-1 h-px bg-line-subtle" />

      {/* Month Header */}
      <div className="flex items-center justify-between px-1 py-1.5">
        <button
          type="button"
          onClick={() => setViewMonth((m) => addMonths(m, -1))}
          className="rounded-lg p-1 text-faint transition-colors hover:bg-hover hover:text-ink"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs font-semibold capitalize text-ink">
          {format(viewMonth, "MMMM 'de' yyyy", { locale: ptBR })}
        </span>
        <button
          type="button"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          className="rounded-lg p-1 text-faint transition-colors hover:bg-hover hover:text-ink"
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-faint">
        {WEEKDAYS.map((wd) => (
          <span key={wd} className="py-1">
            {wd}
          </span>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {days.map((day) => {
          const isSelected = currentDate ? isSameDay(day, currentDate) : false;
          const isCurrentMonth = isSameMonth(day, viewMonth);
          const isDayToday = isToday(day);

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelect(day)}
              className={cn(
                "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors",
                isSelected
                  ? "bg-ink font-semibold text-base"
                  : isDayToday
                    ? "border border-ink/40 font-semibold text-ink hover:bg-hover"
                    : isCurrentMonth
                      ? "text-ink hover:bg-hover"
                      : "text-faint/50 hover:bg-hover/50 hover:text-faint",
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
