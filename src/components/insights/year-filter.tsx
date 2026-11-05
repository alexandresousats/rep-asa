"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export function YearFilter({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: number;
  onChange: (year: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filtrar entregas por ano"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-[38px] items-center gap-2 rounded-full border px-5 text-sm tabular-nums transition-colors",
          open
            ? "border-ink bg-hover text-ink"
            : "border-line bg-base/50 text-ink hover:border-ink/40 hover:bg-hover",
        )}
      >
        {value}
        <ChevronDown
          className={cn("h-4 w-4 text-faint transition-transform", open && "rotate-180")}
          strokeWidth={1.75}
        />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Ano"
          className="menu-in absolute right-0 top-full z-20 mt-1.5 max-h-64 min-w-[7.25rem] overflow-y-auto rounded-2xl border border-line bg-elevated p-1 shadow-2xl"
        >
          {years.map((year) => {
            const selected = year === value;
            return (
              <li key={year}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(year);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-1.5 text-left text-sm tabular-nums",
                    selected ? "bg-hover text-ink" : "text-muted hover:bg-hover hover:text-ink",
                  )}
                >
                  {year}
                  {selected ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
