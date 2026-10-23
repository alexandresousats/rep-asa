"use client";

import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  Minus,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PriorityLabel } from "@/components/tasks/priority-label";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { PRIORITY_ORDER } from "@/lib/priority";
import {
  DATE_FILTERS,
  EMPTY_FILTERS,
  isFiltering,
  type DateFilter,
  type TaskFilterState,
} from "@/lib/task-filters";
import type { Priority, Tag, User } from "@/lib/types";

export type TimelineSort = "due" | "start" | "title" | "priority" | "created";

export type TimelineOptions = {
  showCompleted: boolean;
  showWeekends: boolean;
};

export const DEFAULT_TIMELINE_OPTIONS: TimelineOptions = {
  showCompleted: true,
  showWeekends: true,
};

const SORT_OPTIONS: { id: TimelineSort; label: string }[] = [
  { id: "due", label: "Prazo" },
  { id: "start", label: "Data de início" },
  { id: "title", label: "Nome" },
  { id: "priority", label: "Prioridade" },
  { id: "created", label: "Data de criação" },
];

const NONE = "none";

export function TimelineToolbar({
  undatedCount,
  visibleWeeks,
  filters,
  sort,
  options,
  filterActive,
  onPrev,
  onNext,
  onToday,
  onZoomIn,
  onZoomOut,
  onFiltersChange,
  onSortChange,
  onOptionsChange,
  onUndatedClick,
  users,
  tags,
}: {
  undatedCount: number;
  visibleWeeks: number;
  filters: TaskFilterState;
  sort: TimelineSort;
  options: TimelineOptions;
  filterActive: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFiltersChange: (filters: TaskFilterState) => void;
  onSortChange: (sort: TimelineSort) => void;
  onOptionsChange: (options: TimelineOptions) => void;
  onUndatedClick: () => void;
  users: User[];
  tags: Tag[];
}) {
  const [menu, setMenu] = useState<"filter" | "sort" | "options" | null>(null);
  const filterRef = useRef<HTMLButtonElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-timeline-menu]")) return;
      setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function toggleAssignee(id: string) {
    const assignees = filters.assignees.includes(id)
      ? filters.assignees.filter((item) => item !== id)
      : [...filters.assignees, id];
    onFiltersChange({ ...filters, assignees });
  }

  function togglePriority(priority: Priority) {
    const priorities = filters.priorities.includes(priority)
      ? filters.priorities.filter((item) => item !== priority)
      : [...filters.priorities, priority];
    onFiltersChange({ ...filters, priorities });
  }

  function toggleTag(id: string) {
    const current = filters.tags ?? [];
    const nextTags = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id];
    onFiltersChange({ ...filters, tags: nextTags });
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line-subtle bg-base px-4 py-2 sm:px-6">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Período anterior"
          onClick={onPrev}
          className="rounded-full p-1.5 text-faint hover:bg-hover hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="rounded-full px-3 py-1 text-xs font-medium text-ink hover:bg-hover"
        >
          Hoje
        </button>
        <button
          type="button"
          aria-label="Próximo período"
          onClick={onNext}
          className="rounded-full p-1.5 text-faint hover:bg-hover hover:text-ink"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={onUndatedClick}
          className={cn(
            "rounded-full px-2 py-1 text-xs",
            filters.date === "undated"
              ? "bg-elevated font-medium text-ink"
              : "text-muted hover:bg-hover hover:text-ink",
          )}
        >
          Sem data ({undatedCount})
        </button>

        <div className="flex items-center gap-1 text-xs text-muted">
          <span className="hidden sm:inline">Semanas</span>
          <button
            type="button"
            aria-label="Menos semanas visíveis"
            onClick={onZoomIn}
            disabled={visibleWeeks <= 4}
            className="rounded-full p-1 text-faint hover:bg-hover hover:text-ink disabled:opacity-30"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[1.25rem] text-center tabular-nums text-ink">{visibleWeeks}</span>
          <button
            type="button"
            aria-label="Mais semanas visíveis"
            onClick={onZoomOut}
            disabled={visibleWeeks >= 26}
            className="rounded-full p-1 text-faint hover:bg-hover hover:text-ink disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <span className="hidden h-4 w-px bg-line-subtle sm:block" />

        <button
          ref={filterRef}
          type="button"
          onClick={() => setMenu((m) => (m === "filter" ? null : "filter"))}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs",
            filterActive || menu === "filter"
              ? "bg-elevated font-medium text-ink"
              : "text-muted hover:bg-hover hover:text-ink",
          )}
        >
          <ListFilter className="h-3.5 w-3.5" />
          Filtrar
        </button>
        {menu === "filter" ? (
          <ToolbarMenu anchorRef={filterRef} width={240}>
            <MenuSection title="Data">
              {DATE_FILTERS.map((item) => (
                <MenuOption
                  key={item.id}
                  selected={filters.date === item.id}
                  onClick={() =>
                    onFiltersChange({ ...filters, date: item.id as DateFilter })
                  }
                >
                  {item.label}
                </MenuOption>
              ))}
            </MenuSection>
            <MenuSection title="Responsável">
              <MenuOption
                selected={filters.assignees.includes(NONE)}
                onClick={() => toggleAssignee(NONE)}
              >
                Sem responsável
              </MenuOption>
              {users
                .filter((user) => user.membershipStatus !== "pending")
                .map((user) => (
                  <MenuOption
                    key={user.id}
                    selected={filters.assignees.includes(user.id)}
                    onClick={() => toggleAssignee(user.id)}
                  >
                    <Avatar initials={user.initials} src={user.avatar} name={user.name} size="sm" />
                    <span className="truncate">{user.name.split(" ")[0]}</span>
                  </MenuOption>
                ))}
            </MenuSection>
            <MenuSection title="Prioridade">
              {PRIORITY_ORDER.map((priority) => (
                <MenuOption
                  key={priority}
                  selected={filters.priorities.includes(priority)}
                  onClick={() => togglePriority(priority)}
                >
                  <PriorityLabel priority={priority} />
                </MenuOption>
              ))}
            </MenuSection>
            {tags.length > 0 ? (
              <MenuSection title="Tags">
                {tags.map((tag) => (
                  <MenuOption
                    key={tag.id}
                    selected={Boolean(filters.tags?.includes(tag.id))}
                    onClick={() => toggleTag(tag.id)}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="truncate">{tag.name}</span>
                  </MenuOption>
                ))}
              </MenuSection>
            ) : null}
            {filterActive ? (
              <button
                type="button"
                onClick={() => onFiltersChange(EMPTY_FILTERS)}
                className="mt-2 w-full rounded-xl px-2 py-1.5 text-left text-xs text-faint hover:bg-hover hover:text-ink"
              >
                Limpar filtros
              </button>
            ) : null}
          </ToolbarMenu>
        ) : null}

        <button
          ref={sortRef}
          type="button"
          onClick={() => setMenu((m) => (m === "sort" ? null : "sort"))}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs",
            menu === "sort"
              ? "bg-elevated font-medium text-ink"
              : "text-muted hover:bg-hover hover:text-ink",
          )}
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
          Ordenar
        </button>
        {menu === "sort" ? (
          <ToolbarMenu anchorRef={sortRef}>
            {SORT_OPTIONS.map((item) => (
              <MenuOption
                key={item.id}
                selected={sort === item.id}
                onClick={() => {
                  onSortChange(item.id);
                  setMenu(null);
                }}
              >
                {item.label}
              </MenuOption>
            ))}
          </ToolbarMenu>
        ) : null}

        <button
          ref={optionsRef}
          type="button"
          onClick={() => setMenu((m) => (m === "options" ? null : "options"))}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs",
            menu === "options"
              ? "bg-elevated font-medium text-ink"
              : "text-muted hover:bg-hover hover:text-ink",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Opções
        </button>
        {menu === "options" ? (
          <ToolbarMenu anchorRef={optionsRef}>
            <MenuOption
              selected={options.showCompleted}
              onClick={() =>
                onOptionsChange({ ...options, showCompleted: !options.showCompleted })
              }
            >
              Mostrar tarefas concluídas
            </MenuOption>
            <MenuOption
              selected={options.showWeekends}
              onClick={() =>
                onOptionsChange({ ...options, showWeekends: !options.showWeekends })
              }
            >
              Mostrar fins de semana
            </MenuOption>
          </ToolbarMenu>
        ) : null}
      </div>
    </div>
  );
}

function ToolbarMenu({
  anchorRef,
  width = 220,
  children,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  width?: number;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    function place() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      setPos({ top: rect.bottom + 6, left });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef, width]);

  if (!pos) return null;

  return createPortal(
    <div
      data-timeline-menu
      className="fixed z-50 max-h-[min(70vh,420px)] overflow-y-auto rounded-2xl border border-line bg-elevated p-2 shadow-lg"
      style={{ top: pos.top, left: pos.left, width }}
    >
      {children}
    </div>,
    document.body,
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-faint">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function MenuOption({
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
      className={cn(
        "flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm",
        selected ? "bg-hover text-ink" : "text-ink hover:bg-hover",
      )}
    >
      <span
        className={cn(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-ink bg-ink" : "border-line",
        )}
      >
        {selected ? <span className="h-1.5 w-1.5 rounded-full bg-base" /> : null}
      </span>
      {children}
    </button>
  );
}
