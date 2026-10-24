"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

type ProjectOption = { id: string; name: string; color: string };

export function DemandsProjectFilter({
  value,
  projects,
  onChange,
}: {
  value: string;
  projects: ProjectOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const current = value === "all" ? null : projects.find((p) => p.id === value);
  const label = current?.name ?? "Todos os projetos";

  useLayoutEffect(() => {
    if (!open) return;
    function updatePosition() {
      const el = buttonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuWidth = 260;
      let left = rect.right - menuWidth;
      if (left < 8) left = Math.max(8, rect.left);
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }
      let top = rect.bottom + 6;
      const estimatedHeight = 280;
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Filtrar por projeto"
        className={cn(
          "group inline-flex h-9 items-center gap-2 rounded-full border border-line bg-elevated px-3.5 text-sm text-ink transition-all duration-150 hover:bg-hover",
          open && "border-ink/50 bg-hover shadow-sm ring-1 ring-ink/10",
        )}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full shadow-xs"
          style={{ backgroundColor: current?.color ?? "var(--border-default)" }}
        />
        <span className="max-w-[180px] truncate font-medium">{label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-faint transition-transform duration-150 group-hover:text-ink",
            open && "rotate-180",
          )}
          strokeWidth={1.75}
        />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-label="Projetos"
              style={{ top: coords.top, left: coords.left, width: 260 }}
              className="fixed z-50 rounded-2xl border border-line bg-elevated/95 p-1.5 shadow-2xl backdrop-blur-md menu-in"
            >
              <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
                <span>Projeto</span>
                <span className="font-normal">{projects.length + 1}</span>
              </div>
              <div className="max-h-52 space-y-0.5 overflow-y-auto">
                <ProjectFilterOption
                  selected={value === "all"}
                  label="Todos os projetos"
                  onSelect={() => {
                    onChange("all");
                    setOpen(false);
                  }}
                />
                {projects.map((project) => (
                  <ProjectFilterOption
                    key={project.id}
                    selected={value === project.id}
                    label={project.name}
                    color={project.color}
                    onSelect={() => {
                      onChange(project.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function ProjectFilterOption({
  selected,
  label,
  color,
  onSelect,
}: {
  selected: boolean;
  label: string;
  color?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors",
        selected ? "bg-hover text-ink" : "text-muted hover:bg-hover hover:text-ink",
      )}
    >
      <span
        className="h-3 w-3 shrink-0 rounded-full shadow-xs"
        style={{ backgroundColor: color ?? "var(--border-default)" }}
      />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{label}</span>
      {selected ? <Check className="h-4 w-4 shrink-0 text-ink" strokeWidth={2.5} /> : null}
    </button>
  );
}
