"use client";

import { Check, ListFilter } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PriorityLabel } from "@/components/tasks/priority-label";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { PRIORITY_ORDER } from "@/lib/priority";
import { DATE_FILTERS, type DateFilter, type TaskFilterState } from "@/lib/task-filters";
import type { Priority, User } from "@/lib/types";

const NONE = "none";

export function TaskColumnFilters({
  users,
  filters,
  onChange,
}: {
  users: User[];
  filters: TaskFilterState;
  onChange: (filters: TaskFilterState) => void;
}) {
  const [open, setOpen] = useState<"assignee" | "date" | "priority" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-filter-menu]")) return;
      setOpen(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggleAssignee(id: string) {
    const assignees = filters.assignees.includes(id)
      ? filters.assignees.filter((item) => item !== id)
      : [...filters.assignees, id];
    onChange({ ...filters, assignees });
  }

  function togglePriority(priority: Priority) {
    const priorities = filters.priorities.includes(priority)
      ? filters.priorities.filter((item) => item !== priority)
      : [...filters.priorities, priority];
    onChange({ ...filters, priorities });
  }

  return (
    <div ref={rootRef} className="contents">
      <Column
        label="Responsável"
        active={filters.assignees.length > 0}
        open={open === "assignee"}
        onToggle={() => setOpen((current) => (current === "assignee" ? null : "assignee"))}
      >
        <Option selected={filters.assignees.includes(NONE)} onClick={() => toggleAssignee(NONE)}>
          <span className="text-muted">Sem responsável</span>
        </Option>
        {users
          .filter((user) => user.membershipStatus !== "pending")
          .map((user) => (
          <Option
            key={user.id}
            selected={filters.assignees.includes(user.id)}
            onClick={() => toggleAssignee(user.id)}
          >
            <Avatar initials={user.initials} src={user.avatar} name={user.name} size="sm" />
            <span className="truncate">{user.name.split(" ")[0]}</span>
          </Option>
        ))}
        {filters.assignees.length > 0 ? (
          <Clear
            onClick={() => {
              onChange({ ...filters, assignees: [] });
              setOpen(null);
            }}
          />
        ) : null}
      </Column>

      <Column
        label="Data"
        active={filters.date !== "all"}
        open={open === "date"}
        onToggle={() => setOpen((current) => (current === "date" ? null : "date"))}
      >
        {DATE_FILTERS.map((item) => (
          <Option
            key={item.id}
            selected={filters.date === item.id}
            onClick={() => {
              onChange({ ...filters, date: item.id as DateFilter });
              setOpen(null);
            }}
          >
            {item.label}
          </Option>
        ))}
      </Column>

      <Column
        label="Prioridade"
        active={filters.priorities.length > 0}
        open={open === "priority"}
        onToggle={() => setOpen((current) => (current === "priority" ? null : "priority"))}
      >
        {PRIORITY_ORDER.map((priority) => (
          <Option
            key={priority}
            selected={filters.priorities.includes(priority)}
            onClick={() => togglePriority(priority)}
          >
            <PriorityLabel priority={priority} />
          </Option>
        ))}
        {filters.priorities.length > 0 ? (
          <Clear
            onClick={() => {
              onChange({ ...filters, priorities: [] });
              setOpen(null);
            }}
          />
        ) : null}
      </Column>
    </div>
  );
}

function Column({
  label,
  active,
  open,
  onToggle,
  children,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <span className="flex items-center justify-between gap-2 pr-1">
      <span>{label}</span>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Filtrar ${label}`}
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          "rounded p-0.5",
          active || open ? "text-ink" : "text-faint hover:text-ink",
        )}
      >
        <ListFilter className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
      {open ? <AnchoredMenu anchor={buttonRef.current}>{children}</AnchoredMenu> : null}
    </span>
  );
}

function AnchoredMenu({
  anchor,
  children,
}: {
  anchor: HTMLElement | null;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    function place() {
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = 208;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setPos({ top: rect.bottom + 6, left });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor]);

  if (!anchor) return null;

  return createPortal(
    <div
      data-filter-menu
      className="fixed z-50 min-w-52 rounded-2xl border border-line bg-elevated p-1"
      style={{ top: pos.top, left: pos.left }}
    >
      {children}
    </div>,
    document.body,
  );
}

function Option({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm text-ink hover:bg-hover"
    >
      <span
        className={cn(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-ink bg-ink text-base" : "border-line",
        )}
      >
        {selected ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
      </span>
      {children}
    </button>
  );
}

function Clear({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 w-full rounded-xl px-2 py-1.5 text-left text-xs text-faint hover:bg-hover hover:text-ink"
    >
      Limpar
    </button>
  );
}
