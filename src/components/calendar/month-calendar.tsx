"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfToday,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  GitFork,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { createTask, setTaskStatus, updateTask } from "@/lib/api";
import { cn } from "@/lib/cn";
import { isSameDate, parseDate, toISODate, WEEKDAYS } from "@/lib/dates";
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/priority";
import type { Project, Tag, Task, User } from "@/lib/types";
import { useAccess, useWorkspace } from "@/lib/workspace";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function MonthCalendar({
  month,
  onMonthChange,
  tasks,
  tags,
  users: propUsers,
  projects: propProjects,
  projectId,
  selectedId,
  onSelect,
}: {
  month: Date;
  onMonthChange: (date: Date) => void;
  tasks: Task[];
  tags: Tag[];
  users?: User[];
  projects?: Project[];
  projectId?: string;
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const storeUsers = useWorkspace((state) => state.users);
  const storeProjects = useWorkspace((state) => state.projects);
  const allStoreTasks = useWorkspace((state) => state.tasks);
  const currentUserId = useWorkspace((state) => state.user?.id);
  const { canWrite } = useAccess();

  const users = propUsers ?? storeUsers;
  const projects = propProjects ?? storeProjects;

  // Continuous Range of months (18 months: 6 past, 12 future)
  const [rangeStartMonth, setRangeStartMonth] = useState(() =>
    addMonths(startOfMonth(month), -6),
  );
  const [rangeEndMonth, setRangeEndMonth] = useState(() =>
    addMonths(startOfMonth(month), 12),
  );

  // Dynamic visible month in header
  const [visibleMonth, setVisibleMonth] = useState(month);
  const [prevPropMonth, setPrevPropMonth] = useState(month);
  if (month !== prevPropMonth) {
    setPrevPropMonth(month);
    setVisibleMonth(month);
  }

  // Filters State
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "incomplete" | "done">("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [showUndated, setShowUndated] = useState(false);

  // Quick Add State on specific date
  const [creatingDate, setCreatingDate] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const targetProjectId = projectId || selectedProjectId || projects[0]?.id || "";
  const [creating, setCreating] = useState(false);

  // Popover for "+N mais" tasks
  const [expandedDate, setExpandedDate] = useState<Date | null>(null);

  const filterRef = useRef<HTMLDivElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const initialScrolledRef = useRef(false);
  const pendingScrollAdjustRef = useRef<{ prevHeight: number; prevScrollTop: number } | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (pendingScrollAdjustRef.current && scrollContainerRef.current) {
      const { prevHeight, prevScrollTop } = pendingScrollAdjustRef.current;
      const added = scrollContainerRef.current.scrollHeight - prevHeight;
      scrollContainerRef.current.scrollTop = prevScrollTop + added;
      pendingScrollAdjustRef.current = null;
    }
  }, [rangeStartMonth]);

  const today = startOfToday();

  // Generate continuous interval of all days
  const allDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(rangeStartMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(rangeEndMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [rangeStartMonth, rangeEndMonth]);

  // Group days into weeks (7 days each)
  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      result.push(allDays.slice(i, i + 7));
    }
    return result;
  }, [allDays]);

  // Initial scroll to current month on mount
  useEffect(() => {
    if (initialScrolledRef.current) return;
    const initialDayId = `day-${toISODate(startOfMonth(month))}`;
    const targetEl = document.getElementById(initialDayId);
    if (targetEl && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const headerEl = container.querySelector<HTMLElement>(".sticky");
      const headerHeight = headerEl?.offsetHeight ?? 40;
      const weekRow = targetEl.closest<HTMLElement>("[data-week-index]");
      const targetTop = weekRow ? weekRow.offsetTop - headerHeight : targetEl.offsetTop - headerHeight;
      container.scrollTop = Math.max(0, targetTop);
      initialScrolledRef.current = true;
    }
  }, [month, allDays]);

  // Focus input when inline creation opens
  useEffect(() => {
    if (creatingDate) {
      inlineInputRef.current?.focus();
    }
  }, [creatingDate]);

  // Close filter on outside click
  useEffect(() => {
    if (!filterOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [filterOpen]);

  // Continuous scroll listener: detect visible month & expand range dynamically
  function handleScroll() {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, clientHeight, scrollHeight } = container;

    // Detect which month is currently visible right below the sticky header
    const headerEl = container.querySelector<HTMLElement>(".sticky");
    const headerHeight = headerEl?.offsetHeight ?? 40;
    const targetY = scrollTop + headerHeight + 35;

    const weekRows = container.querySelectorAll<HTMLElement>("[data-week-index]");
    let activeMonthISO: string | null = null;

    for (let i = 0; i < weekRows.length; i++) {
      const row = weekRows[i];
      const rowTop = row.offsetTop;
      const rowBottom = rowTop + row.offsetHeight;

      if (rowTop <= targetY && rowBottom > targetY) {
        activeMonthISO = row.getAttribute("data-week-month");
        break;
      }
    }

    if (!activeMonthISO && weekRows.length > 0) {
      if (targetY < weekRows[0].offsetTop) {
        activeMonthISO = weekRows[0].getAttribute("data-week-month");
      } else {
        activeMonthISO = weekRows[weekRows.length - 1].getAttribute("data-week-month");
      }
    }

    if (activeMonthISO) {
      const detectedDate = parseDate(activeMonthISO);
      if (!isSameMonth(detectedDate, visibleMonth)) {
        setVisibleMonth(detectedDate);
        onMonthChange(detectedDate);
      }
    }

    // Infinite scroll expansion at bottom
    if (scrollTop + clientHeight >= scrollHeight - 350) {
      setRangeEndMonth((prev) => addMonths(prev, 6));
    }

    // Infinite scroll expansion at top
    if (scrollTop <= 200 && !pendingScrollAdjustRef.current) {
      pendingScrollAdjustRef.current = {
        prevHeight: container.scrollHeight,
        prevScrollTop: container.scrollTop,
      };
      setRangeStartMonth((prev) => addMonths(prev, -6));
    }
  }

  // Smooth scroll to month
  function scrollToMonth(targetDate: Date) {
    const targetISO = toISODate(startOfMonth(targetDate));
    const targetId = `day-${targetISO}`;
    const el = document.getElementById(targetId);
    if (el && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const headerEl = container.querySelector<HTMLElement>(".sticky");
      const headerHeight = headerEl?.offsetHeight ?? 40;
      const weekRow = el.closest<HTMLElement>("[data-week-index]");
      const targetTop = weekRow ? weekRow.offsetTop - headerHeight : el.offsetTop - headerHeight;
      container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    } else {
      // If outside currently loaded range, expand range first
      if (targetDate < rangeStartMonth) {
        setRangeStartMonth(addMonths(startOfMonth(targetDate), -3));
      } else if (targetDate > rangeEndMonth) {
        setRangeEndMonth(addMonths(startOfMonth(targetDate), 5));
      }
      setTimeout(() => {
        const newEl = document.getElementById(targetId);
        if (newEl && scrollContainerRef.current) {
          const container = scrollContainerRef.current;
          const headerEl = container.querySelector<HTMLElement>(".sticky");
          const headerHeight = headerEl?.offsetHeight ?? 40;
          const weekRow = newEl.closest<HTMLElement>("[data-week-index]");
          const targetTop = weekRow ? weekRow.offsetTop - headerHeight : newEl.offsetTop - headerHeight;
          container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
        }
      }, 60);
    }
  }

  function scrollToToday() {
    const todayISO = toISODate(today);
    const targetId = `day-${todayISO}`;
    const el = document.getElementById(targetId);
    if (el && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const headerEl = container.querySelector<HTMLElement>(".sticky");
      const headerHeight = headerEl?.offsetHeight ?? 40;
      const weekRow = el.closest<HTMLElement>("[data-week-index]");
      const targetTop = weekRow ? weekRow.offsetTop - headerHeight : el.offsetTop - headerHeight;
      container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    } else {
      scrollToMonth(today);
    }
  }

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        if (!task.title.toLowerCase().includes(q)) return false;
      }
      if (statusFilter === "incomplete" && task.status === "done") return false;
      if (statusFilter === "done" && task.status !== "done") return false;
      if (assigneeFilter === "unassigned" && task.assigneeId) return false;
      if (assigneeFilter === "me" && task.assigneeId !== currentUserId) return false;
      if (
        assigneeFilter !== "all" &&
        assigneeFilter !== "unassigned" &&
        assigneeFilter !== "me" &&
        task.assigneeId !== assigneeFilter
      ) {
        return false;
      }
      if (tagFilter !== "all" && !task.tagIds?.includes(tagFilter)) return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      if (projectFilter !== "all" && task.projectId !== projectFilter) return false;
      return true;
    });
  }, [
    tasks,
    search,
    statusFilter,
    assigneeFilter,
    tagFilter,
    priorityFilter,
    projectFilter,
    currentUserId,
  ]);

  const undatedTasks = useMemo(() => {
    return filteredTasks.filter((task) => !task.dueDate);
  }, [filteredTasks]);

  const activeFiltersCount =
    (statusFilter !== "all" ? 1 : 0) +
    (assigneeFilter !== "all" ? 1 : 0) +
    (tagFilter !== "all" ? 1 : 0) +
    (priorityFilter !== "all" ? 1 : 0) +
    (projectFilter !== "all" ? 1 : 0) +
    (search.trim() ? 1 : 0);

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setAssigneeFilter("all");
    setTagFilter("all");
    setPriorityFilter("all");
    setProjectFilter("all");
  }

  async function handleCreateInlineTask(dateISO: string) {
    const trimmed = newTitle.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const activeProjId = projectId || targetProjectId || projects[0]?.id;
      if (!activeProjId) return;
      const proj = projects.find((p) => p.id === activeProjId);
      const section = proj?.sections?.[0];

      const created = await createTask({
        projectId: activeProjId,
        title: trimmed,
        dueDate: dateISO,
        startDate: dateISO,
        section,
      });
      if (created) {
        onSelect(created.id);
      }
      setCreatingDate(null);
      setNewTitle("");
    } catch (err) {
      console.error("Falha ao criar tarefa no calendário:", err);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Asana-style Top Navigation & Filter Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle pb-4 shrink-0">
        {/* Left side: Quick Add & Smooth Month Navigation */}
        <div className="flex flex-wrap items-center gap-2.5">
          {canWrite ? (
            <button
              type="button"
              onClick={() => {
                const todayStr = toISODate(today);
                setCreatingDate(todayStr);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:opacity-90 transition-opacity dark:text-black"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Adicionar uma tarefa</span>
            </button>
          ) : null}

          {/* Month Stepper & Today */}
          <div className="inline-flex items-center rounded-xl border border-line bg-elevated/60 p-0.5 shadow-xs">
            <button
              type="button"
              aria-label="Mês anterior"
              title="Mês anterior"
              onClick={() => {
                const prev = addMonths(visibleMonth, -1);
                setVisibleMonth(prev);
                onMonthChange(prev);
                scrollToMonth(prev);
              }}
              className="rounded-lg p-1.5 text-faint hover:bg-hover hover:text-ink transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const todayMonth = startOfMonth(today);
                setVisibleMonth(todayMonth);
                onMonthChange(todayMonth);
                scrollToToday();
              }}
              className="px-2.5 py-1 text-xs font-medium text-faint hover:text-ink transition-colors"
            >
              Hoje
            </button>
            <button
              type="button"
              aria-label="Próximo mês"
              title="Próximo mês"
              onClick={() => {
                const next = addMonths(visibleMonth, 1);
                setVisibleMonth(next);
                onMonthChange(next);
                scrollToMonth(next);
              }}
              className="rounded-lg p-1.5 text-faint hover:bg-hover hover:text-ink transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Month title: updates dynamically in real-time as you scroll! */}
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-ink">
            {format(visibleMonth, "MMMM", { locale: ptBR }).charAt(0).toUpperCase() +
              format(visibleMonth, "MMMM", { locale: ptBR }).slice(1)}{" "}
            de {format(visibleMonth, "yyyy")}
          </h2>
        </div>

        {/* Right side: Search, Undated Tasks Drawer & Filter Popover */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Search */}
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-faint" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="h-8 w-28 sm:w-36 rounded-xl border border-line bg-elevated/60 pl-8 pr-7 text-xs text-ink placeholder:text-faint outline-none focus:w-48 focus:border-ink transition-all"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 text-faint hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {/* Undated Tasks Toggle */}
          <button
            type="button"
            onClick={() => setShowUndated((prev) => !prev)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-xl border border-line px-2.5 text-xs transition-colors",
              showUndated
                ? "bg-ink text-white dark:text-black font-medium border-transparent shadow-xs"
                : "bg-elevated/60 text-faint hover:border-line-subtle hover:text-ink",
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Sem data</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px] font-semibold",
                showUndated
                  ? "bg-white/20 text-white dark:bg-black/20 dark:text-black"
                  : "bg-base text-ink",
              )}
            >
              {undatedTasks.length}
            </span>
          </button>

          {/* Filters Button */}
          <div ref={filterRef} className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((prev) => !prev)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-xl border border-line px-2.5 text-xs transition-colors",
                activeFiltersCount > 0
                  ? "border-ink text-ink bg-hover font-medium"
                  : "bg-elevated/60 text-faint hover:border-line-subtle hover:text-ink",
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Filtrar</span>
              {activeFiltersCount > 0 ? (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold text-white dark:text-black">
                  {activeFiltersCount}
                </span>
              ) : null}
            </button>

            {/* Filter Dropdown */}
            {filterOpen ? (
              <div className="absolute right-0 top-full mt-2 z-40 w-72 sm:w-80 rounded-2xl border border-line bg-elevated p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-line-subtle pb-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                    <Filter className="h-3.5 w-3.5" />
                    <span>Filtros do Calendário</span>
                  </div>
                  {activeFiltersCount > 0 ? (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="inline-flex items-center gap-1 text-[11px] text-faint hover:text-ink transition-colors"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Limpar</span>
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 space-y-3.5 text-xs">
                  {/* Status Filter */}
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-faint">
                      Status
                    </label>
                    <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-base/50 p-1">
                      {(
                        [
                          { id: "all", label: "Todas" },
                          { id: "incomplete", label: "Incompletas" },
                          { id: "done", label: "Concluídas" },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setStatusFilter(item.id)}
                          className={cn(
                            "rounded-lg py-1 text-center text-[11px] transition-colors",
                            statusFilter === item.id
                              ? "bg-elevated font-semibold text-ink shadow-xs"
                              : "text-faint hover:text-ink",
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Assignee Filter */}
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-faint">
                      Responsável
                    </label>
                    <select
                      value={assigneeFilter}
                      onChange={(e) => setAssigneeFilter(e.target.value)}
                      className="w-full rounded-xl border border-line bg-base/50 px-2.5 py-1.5 text-xs text-ink outline-none"
                    >
                      <option value="all">Todos os responsáveis</option>
                      {currentUserId ? (
                        <option value="me">Atribuídas a mim</option>
                      ) : null}
                      <option value="unassigned">Sem responsável</option>
                      {users
                        .filter((u) => u.membershipStatus !== "pending")
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Tags Filter */}
                  {tags.length > 0 ? (
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-faint">
                        Tag
                      </label>
                      <select
                        value={tagFilter}
                        onChange={(e) => setTagFilter(e.target.value)}
                        className="w-full rounded-xl border border-line bg-base/50 px-2.5 py-1.5 text-xs text-ink outline-none"
                      >
                        <option value="all">Todas as tags</option>
                        {tags.map((t) => (
                          <option key={t.id} value={t.id}>
                            #{t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {/* Priority Filter */}
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-faint">
                      Prioridade
                    </label>
                    <select
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value)}
                      className="w-full rounded-xl border border-line bg-base/50 px-2.5 py-1.5 text-xs text-ink outline-none"
                    >
                      <option value="all">Todas as prioridades</option>
                      {PRIORITY_ORDER.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_META[p].label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Projects Filter (if multiple) */}
                  {projects.length > 1 && !projectId ? (
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-faint">
                        Projeto
                      </label>
                      <select
                        value={projectFilter}
                        onChange={(e) => setProjectFilter(e.target.value)}
                        className="w-full rounded-xl border border-line bg-base/50 px-2.5 py-1.5 text-xs text-ink outline-none"
                      >
                        <option value="all">Todos os projetos</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Main Continuous Calendar Area + Undated Drawer */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* Continuous Scroll Container (Asana-style) */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-elevated shadow-xs"
        >
          {/* Sticky Weekday Column Headers */}
          <div className="sticky top-0 z-20 grid grid-cols-7 border-b border-line bg-elevated/95 backdrop-blur-sm">
            {WEEKDAYS.map((day, index) => {
              const isWeekend = index === 5 || index === 6;
              return (
                <div
                  key={day}
                  className={cn(
                    "border-r border-line py-2.5 text-center text-xs font-semibold tracking-wide uppercase last:border-r-0",
                    isWeekend ? "bg-base/40 text-faint" : "text-ink",
                  )}
                >
                  {day}
                </div>
              );
            })}
          </div>

          {/* Continuous Weeks Grid */}
          <div className="divide-y divide-line">
            {weeks.map((week, weekIndex) => {
              const weekMonthISO = toISODate(startOfMonth(week[3]));
              return (
                <div
                  key={weekIndex}
                  data-week-index={weekIndex}
                  data-week-month={weekMonthISO}
                  className="grid grid-cols-7 divide-x divide-line relative"
                >
                  {week.map((day, dayIndex) => {
                    const isWeekend = dayIndex === 5 || dayIndex === 6;
                    const isToday = isSameDay(day, today);
                    const dayISO = toISODate(day);
                    const isFirstDayOfMonth = day.getDate() === 1;

                    const dayTasks = filteredTasks.filter(
                      (task) => task.dueDate && isSameDate(task.dueDate, day),
                    );

                    const isCreating = creatingDate === dayISO;
                    const maxVisible = 3;
                    const visibleTasks = dayTasks.slice(0, maxVisible);
                    const extraTasksCount = dayTasks.length - maxVisible;

                    return (
                      <div
                        key={dayISO}
                        id={`day-${dayISO}`}
                        data-date={dayISO}
                        onClick={() => {
                          if (canWrite && !isCreating) {
                            setCreatingDate(dayISO);
                          }
                        }}
                        className={cn(
                          "group relative min-h-[145px] sm:min-h-[160px] p-1.5 sm:p-2 transition-colors",
                          "cursor-copy",
                          isWeekend ? "bg-base/25 dark:bg-black/20" : "bg-elevated",
                          "hover:bg-hover/30",
                        )}
                      >
                        {/* Day Header: Number/Month name + Hover Add button */}
                        <div className="mb-1.5 flex items-center justify-between">
                          <span
                            className={cn(
                              "inline-flex items-center text-xs transition-transform",
                              isToday
                                ? "h-6 w-6 items-center justify-center rounded-full bg-blue-600 font-bold text-white shadow-xs"
                                : isFirstDayOfMonth
                                  ? "font-bold text-ink rounded-md bg-ink/10 dark:bg-white/10 px-1.5 py-0.5"
                                  : "font-medium text-faint group-hover:text-ink",
                            )}
                          >
                            {isFirstDayOfMonth ? (
                              <span>{format(day, "d MMM", { locale: ptBR })}</span>
                            ) : (
                              format(day, "d")
                            )}
                          </span>

                        {/* Quick + Button on hover */}
                        {canWrite ? (
                          <button
                            type="button"
                            aria-label="Adicionar tarefa neste dia"
                            title="Adicionar tarefa neste dia"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCreatingDate(dayISO);
                            }}
                            className="opacity-0 group-hover:opacity-100 h-5 w-5 rounded-full flex items-center justify-center text-faint hover:bg-hover hover:text-ink transition-all"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>

                      {/* Tasks List */}
                      <div className="space-y-1.5">
                        {visibleTasks.map((task) => (
                          <CalendarTaskCard
                            key={task.id}
                            task={task}
                            tags={tags}
                            users={users}
                            projects={projects}
                            allTasks={allStoreTasks}
                            selectedId={selectedId}
                            onSelect={onSelect}
                          />
                        ))}

                        {/* Inline Task Creator */}
                        {isCreating ? (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-xl border border-line bg-elevated p-2 shadow-lg animate-in fade-in zoom-in-95 duration-100 text-left"
                          >
                            <input
                              ref={inlineInputRef}
                              type="text"
                              value={newTitle}
                              onChange={(e) => setNewTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void handleCreateInlineTask(dayISO);
                                if (e.key === "Escape") {
                                  setCreatingDate(null);
                                  setNewTitle("");
                                }
                              }}
                              placeholder="Nome da tarefa..."
                              className="w-full bg-transparent text-xs font-medium text-ink placeholder:text-faint outline-none"
                            />
                            <div className="mt-2 flex items-center justify-between gap-1">
                              {projects.length > 1 && !projectId ? (
                                <select
                                  value={targetProjectId}
                                  onChange={(e) => setSelectedProjectId(e.target.value)}
                                  className="max-w-[100px] truncate bg-transparent text-[10px] text-faint outline-none hover:text-ink"
                                >
                                  {projects.map((p) => (
                                    <option
                                      key={p.id}
                                      value={p.id}
                                      className="bg-elevated text-ink"
                                    >
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span />
                              )}
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCreatingDate(null);
                                    setNewTitle("");
                                  }}
                                  className="px-1.5 py-0.5 text-[10px] text-faint hover:text-ink"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  disabled={!newTitle.trim() || creating}
                                  onClick={() => void handleCreateInlineTask(dayISO)}
                                  className="rounded-md bg-ink px-2 py-0.5 text-[10px] font-medium text-white dark:text-black disabled:opacity-50"
                                >
                                  Criar
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {/* "+N mais" button if day has overflow */}
                        {extraTasksCount > 0 ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedDate(day);
                            }}
                            className="w-full rounded-md py-0.5 text-center text-[11px] font-medium text-faint hover:bg-hover hover:text-ink transition-colors"
                          >
                            Mais {extraTasksCount}
                          </button>
                        ) : null}

                        {/* Hover "+ Adicionar uma tarefa" button at bottom */}
                        {!isCreating && canWrite ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCreatingDate(dayISO);
                            }}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] text-faint hover:text-ink px-1.5 py-0.5 rounded hover:bg-hover/80 w-full justify-start transition-opacity"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Adicionar uma tarefa</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          </div>
        </div>

        {/* Undated Tasks Slide-over Panel ("Sem data") */}
        {showUndated ? (
          <div className="w-72 sm:w-80 shrink-0 border-l border-line bg-elevated p-4 overflow-y-auto overscroll-contain animate-in slide-in-from-right-4 duration-150">
            <div className="flex items-center justify-between border-b border-line-subtle pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-faint" />
                <h3 className="text-xs font-semibold text-ink">
                  Sem data ({undatedTasks.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUndated(false)}
                className="rounded-lg p-1 text-faint hover:bg-hover hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-[11px] text-faint">
              Tarefas sem data de conclusão. Clique para agendar ou abrir.
            </p>

            <div className="mt-3 space-y-2">
              {undatedTasks.length > 0 ? (
                undatedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="group rounded-xl border border-line bg-base/50 p-2.5 transition-all hover:border-line-subtle hover:bg-hover/50 hover:shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelect(task.id)}
                        className="text-left text-xs font-medium text-ink hover:underline line-clamp-2"
                      >
                        {task.title}
                      </button>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-1 text-[11px]">
                      {/* Quick Schedule to Today */}
                      <button
                        type="button"
                        onClick={() =>
                          updateTask(task.id, {
                            dueDate: toISODate(today),
                            startDate: toISODate(today),
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[10px] text-faint hover:border-ink hover:text-ink transition-colors"
                      >
                        <CalendarIcon className="h-3 w-3" />
                        <span>Para hoje</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelect(task.id)}
                        className="text-[10px] text-faint hover:text-ink"
                      >
                        Abrir detalhes →
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-faint">
                  Nenhuma tarefa sem data!
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Popover for Day Tasks Overflow ("Mais N") */}
      {expandedDate ? (
        <DayTasksModal
          date={expandedDate}
          tasks={filteredTasks.filter(
            (t) => t.dueDate && isSameDate(t.dueDate, expandedDate),
          )}
          tags={tags}
          users={users}
          projects={projects}
          allTasks={allStoreTasks}
          selectedId={selectedId}
          onSelect={onSelect}
          onClose={() => setExpandedDate(null)}
          onAddTask={() => {
            const dateStr = toISODate(expandedDate);
            setExpandedDate(null);
            setCreatingDate(dateStr);
          }}
        />
      ) : null}
    </div>
  );
}

// Asana-Style Task Card for Calendar
function CalendarTaskCard({
  task,
  tags,
  users,
  projects,
  allTasks,
  selectedId,
  onSelect,
}: {
  task: Task;
  tags: Tag[];
  users: User[];
  projects: Project[];
  allTasks: Task[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const isDone = task.status === "done";
  const assignee = users.find((u) => u.id === task.assigneeId);
  const taskTags = tags.filter((t) => task.tagIds?.includes(t.id));
  const primaryTag = taskTags[0];
  const project = projects.find((p) => p.id === task.projectId);

  // Card color priority: primary tag color -> project color -> neutral
  const color = primaryTag?.color ?? project?.color ?? "#8b5cf6";

  const subtasksCount = useMemo(() => {
    return allTasks.filter((t) => t.parentId === task.id).length;
  }, [allTasks, task.id]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(task.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(task.id);
        }
      }}
      className={cn(
        "group relative flex w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-xs transition-all duration-150",
        "border-black/10 dark:border-white/10 shadow-2xs hover:shadow-xs hover:brightness-95 dark:hover:brightness-110",
        selectedId === task.id && "ring-2 ring-ink ring-offset-1 ring-offset-elevated",
        isDone && "opacity-60",
      )}
      style={{
        backgroundColor: `${color}25`,
        borderLeftWidth: "3.5px",
        borderLeftColor: color,
      }}
    >
      {/* Assignee Avatar */}
      {assignee ? (
        <span className="shrink-0">
          <Avatar
            initials={assignee.initials}
            src={assignee.avatar}
            name={assignee.name}
            size="xs"
          />
        </span>
      ) : null}

      {/* Completion Checkmark */}
      <button
        type="button"
        aria-label={isDone ? "Marcar como a fazer" : "Marcar como concluída"}
        onClick={(e) => {
          e.stopPropagation();
          setTaskStatus(task.id, isDone ? "todo" : "done");
        }}
        className={cn(
          "shrink-0 h-3.5 w-3.5 rounded-full flex items-center justify-center transition-all",
          isDone
            ? "bg-emerald-600 text-white shadow-2xs"
            : "border border-ink/40 hover:border-ink hover:bg-ink/10",
        )}
      >
        {isDone ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : null}
      </button>

      {/* Title */}
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-medium text-ink leading-tight",
          isDone && "line-through text-faint",
        )}
        title={task.title}
      >
        {task.title}
      </span>

      {/* Subtasks Count Icon */}
      {subtasksCount > 0 ? (
        <span
          className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-faint font-medium"
          title={`${subtasksCount} subtarefa(s)`}
        >
          <GitFork className="h-2.5 w-2.5 text-faint" />
          <span>{subtasksCount}</span>
        </span>
      ) : null}

      {/* Extra Tag Color Dots */}
      {taskTags.length > 1 ? (
        <div className="flex items-center gap-0.5 shrink-0">
          {taskTags.slice(1, 3).map((t) => (
            <span
              key={t.id}
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: t.color }}
              title={t.name}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Modal for days with many tasks ("+N mais")
function DayTasksModal({
  date,
  tasks,
  tags,
  users,
  projects,
  allTasks,
  selectedId,
  onSelect,
  onClose,
  onAddTask,
}: {
  date: Date;
  tasks: Task[];
  tags: Tag[];
  users: User[];
  projects: Project[];
  allTasks: Task[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onAddTask: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-xs"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-line bg-elevated p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-line-subtle pb-3">
          <div>
            <h3 className="text-sm font-semibold text-ink capitalize">
              {format(date, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </h3>
            <p className="text-xs text-faint">{tasks.length} tarefa(s) agendada(s)</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-faint hover:bg-hover hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto overscroll-contain pr-1">
          {tasks.map((task) => (
            <CalendarTaskCard
              key={task.id}
              task={task}
              tags={tags}
              users={users}
              projects={projects}
              allTasks={allTasks}
              selectedId={selectedId}
              onSelect={(id) => {
                onSelect(id);
                onClose();
              }}
            />
          ))}
        </div>

        <div className="mt-4 border-t border-line-subtle pt-3 flex justify-end">
          <button
            type="button"
            onClick={onAddTask}
            className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:opacity-90 dark:text-black"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Adicionar tarefa</span>
          </button>
        </div>
      </div>
    </div>
  );
}
