"use client";

import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  parseISO,
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
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Avatar } from "@/components/ui/avatar";
import { createTask, setTaskStatus, updateTask } from "@/lib/api";
import { cn } from "@/lib/cn";
import { parseDate, toISODate, WEEKDAYS } from "@/lib/dates";
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/priority";
import type { Project, Tag, Task, User } from "@/lib/types";
import { useAccess, useWorkspace } from "@/lib/workspace";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Dia local (AAAA-MM-DD) do vencimento. Dá o mesmo dia que isSameDate dava,
// mas é calculado uma vez por tarefa em vez de uma vez por tarefa e por dia.
function dueDayKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toISODate(parseISO(value));
}

const EMPTY_TASKS: Task[] = [];

// Funções estáveis que as semanas e os cartões recebem. Elas sempre chamam a
// versão mais recente do handler, então mudar o estado do calendário não força
// todas as semanas a renderizar de novo.
type CalendarActions = {
  select: (id: string) => void;
  dragTask: (event: React.DragEvent, taskId: string) => void;
  dragTaskEnd: () => void;
  dayClick: (dayISO: string, isCreating: boolean) => void;
  dayDragOver: (event: React.DragEvent, dayISO: string) => void;
  dayDrop: (event: React.DragEvent, dayISO: string) => void;
  openCreator: (dayISO: string) => void;
  expandDay: (day: Date) => void;
  setNewTitle: (value: string) => void;
  submitCreator: (dayISO: string) => void;
  cancelCreator: () => void;
  setProject: (id: string) => void;
};

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
  onFilteredChange,
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
  onFilteredChange?: (ids: string[] | null) => void;
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const suppressDayClickRef = useRef(false);

  const filterRef = useRef<HTMLDivElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const inlineCreatorRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const initialScrolledRef = useRef(false);
  const pendingScrollAdjustRef = useRef<{ prevHeight: number; prevScrollTop: number } | null>(null);
  const pendingEndExpandRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);

  const newTitleRef = useRef(newTitle);
  newTitleRef.current = newTitle;
  const creatingDateRef = useRef(creatingDate);
  creatingDateRef.current = creatingDate;

  useIsomorphicLayoutEffect(() => {
    if (pendingScrollAdjustRef.current && scrollContainerRef.current) {
      const { prevHeight, prevScrollTop } = pendingScrollAdjustRef.current;
      const added = scrollContainerRef.current.scrollHeight - prevHeight;
      scrollContainerRef.current.scrollTop = prevScrollTop + added;
      pendingScrollAdjustRef.current = null;
    }
  }, [rangeStartMonth]);

  // Libera a próxima expansão para baixo só depois que a anterior entrou na tela.
  useIsomorphicLayoutEffect(() => {
    pendingEndExpandRef.current = false;
  }, [rangeEndMonth]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    },
    [],
  );

  const today = startOfToday();
  const todayISO = toISODate(today);

  // Semanas do intervalo carregado, identificadas pela segunda-feira (AAAA-MM-DD).
  const weeks = useMemo(() => {
    const start = startOfWeek(startOfMonth(rangeStartMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(rangeEndMonth), { weekStartsOn: 1 });
    const result: { start: string; end: string }[] = [];
    for (let day = start; day <= end; day = addDays(day, 7)) {
      result.push({ start: toISODate(day), end: toISODate(addDays(day, 6)) });
    }
    return result;
  }, [rangeStartMonth, rangeEndMonth]);

  // Initial scroll to current month on mount
  useEffect(() => {
    if (initialScrolledRef.current) return;
    const initialDayId = `day-${toISODate(startOfMonth(month))}`;
    const targetEl = document.getElementById(initialDayId);
    if (targetEl && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const headerEl = container.querySelector<HTMLElement>(".sticky");
      const headerHeight = headerEl?.offsetHeight ?? 40;
      const weekRow = targetEl.closest<HTMLElement>("[data-week-start]");
      const targetTop = weekRow ? weekRow.offsetTop - headerHeight : targetEl.offsetTop - headerHeight;
      container.scrollTop = Math.max(0, targetTop);
      initialScrolledRef.current = true;
    }
  }, [month, weeks]);

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

  // Auto-create or close inline task on outside click
  useEffect(() => {
    if (!creatingDate) return;
    function onPointerDown(event: MouseEvent) {
      if (
        inlineCreatorRef.current &&
        !inlineCreatorRef.current.contains(event.target as Node)
      ) {
        const currentDate = creatingDateRef.current;
        const currentTitle = newTitleRef.current.trim();
        if (currentDate && currentTitle) {
          void handleCreateInlineTask(currentDate, currentTitle);
        } else {
          setCreatingDate(null);
          setNewTitle("");
        }
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [creatingDate]);

  // O navegador dispara scroll várias vezes por quadro; processa no máximo uma por quadro.
  function onScroll() {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      handleScrollRef.current();
    });
  }

  // Continuous scroll listener: detect visible month & expand range dynamically
  function handleScroll() {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, clientHeight, scrollHeight } = container;

    // Detect which month is currently visible right below the sticky header
    const headerEl = container.querySelector<HTMLElement>(".sticky");
    const headerHeight = headerEl?.offsetHeight ?? 40;
    const targetY = scrollTop + headerHeight + 35;

    const weekRows = container.querySelectorAll<HTMLElement>("[data-week-start]");
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

    // Infinite scroll expansion at bottom. Sem a trava, cada evento de scroll
    // antes do próximo render somava mais 6 meses de uma vez.
    if (scrollTop + clientHeight >= scrollHeight - 350 && !pendingEndExpandRef.current) {
      pendingEndExpandRef.current = true;
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
  const handleScrollRef = useRef(handleScroll);
  handleScrollRef.current = handleScroll;

  // Smooth scroll to month
  function scrollToMonth(targetDate: Date) {
    const targetISO = toISODate(startOfMonth(targetDate));
    const targetId = `day-${targetISO}`;
    const el = document.getElementById(targetId);
    if (el && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const headerEl = container.querySelector<HTMLElement>(".sticky");
      const headerHeight = headerEl?.offsetHeight ?? 40;
      const weekRow = el.closest<HTMLElement>("[data-week-start]");
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
          const weekRow = newEl.closest<HTMLElement>("[data-week-start]");
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
      const weekRow = el.closest<HTMLElement>("[data-week-start]");
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

  const filtering =
    search.trim() !== "" ||
    statusFilter !== "all" ||
    assigneeFilter !== "all" ||
    tagFilter !== "all" ||
    priorityFilter !== "all" ||
    projectFilter !== "all";

  useEffect(() => {
    onFilteredChange?.(filtering ? filteredTasks.map((task) => task.id) : null);
  }, [filtering, filteredTasks, onFilteredChange]);

  const undatedTasks = useMemo(() => {
    return filteredTasks.filter((task) => !task.dueDate);
  }, [filteredTasks]);

  // Índice dia -> tarefas, montado uma vez. Antes cada célula percorria todas as
  // tarefas e reconvertia cada data: com 2.000 tarefas e 18 meses isso passava
  // de 1 segundo por render, e o scroll renderiza o calendário várias vezes.
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of filteredTasks) {
      if (!task.dueDate) continue;
      const key = dueDayKey(task.dueDate);
      const list = map.get(key);
      if (list) list.push(task);
      else map.set(key, [task]);
    }
    return map;
  }, [filteredTasks]);

  // Quantas subtarefas cada tarefa tem, contado uma vez para todos os cartões.
  const subtaskCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of allStoreTasks) {
      if (task.parentId) map.set(task.parentId, (map.get(task.parentId) ?? 0) + 1);
    }
    return map;
  }, [allStoreTasks]);

  const activeFiltersCount =
    (statusFilter !== "all" ? 1 : 0) +
    (assigneeFilter !== "all" ? 1 : 0) +
    (tagFilter !== "all" ? 1 : 0) +
    (priorityFilter !== "all" ? 1 : 0) +
    (projectFilter !== "all" ? 1 : 0) +
    (search.trim() ? 1 : 0);

  function moveTaskToDate(taskId: string, targetISO: string) {
    if (!canWrite) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const due = task.dueDate?.slice(0, 10) ?? null;
    if (due === targetISO) return;
    if (!due) {
      const start = task.startDate?.slice(0, 10);
      updateTask(task.id, {
        dueDate: targetISO,
        startDate: start && start <= targetISO ? start : targetISO,
      });
    } else {
      const delta = differenceInCalendarDays(parseDate(targetISO), parseDate(due));
      const start = task.startDate?.slice(0, 10);
      updateTask(task.id, {
        dueDate: targetISO,
        ...(start ? { startDate: toISODate(addDays(parseDate(start), delta)) } : {}),
      });
    }
    setExpandedDate(null);
  }

  function scrollWhileDragging(event: React.DragEvent) {
    const container = scrollContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const edge = 64;
    if (event.clientY < rect.top + edge) container.scrollTop -= 22;
    else if (event.clientY > rect.bottom - edge) container.scrollTop += 22;
  }

  function beginTaskDrag(event: React.DragEvent, taskId: string) {
    if (!canWrite) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
    draggingIdRef.current = taskId;
    setDraggingId(taskId);
  }

  function endTaskDrag() {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDropDate(null);
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setAssigneeFilter("all");
    setTagFilter("all");
    setPriorityFilter("all");
    setProjectFilter("all");
  }

  async function handleCreateInlineTask(dateISO: string, customTitle?: string) {
    const raw = customTitle ?? newTitle;
    const trimmed = raw.trim();
    if (!trimmed || creating) {
      setCreatingDate(null);
      setNewTitle("");
      return;
    }
    setCreatingDate(null);
    setNewTitle("");
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
    } catch (err) {
      console.error("Falha ao criar tarefa no calendário:", err);
    } finally {
      setCreating(false);
    }
  }

  function handleDayClick(dayISO: string, isCreating: boolean) {
    if (suppressDayClickRef.current) {
      suppressDayClickRef.current = false;
      return;
    }
    if (canWrite && !isCreating && !draggingId) {
      setCreatingDate(dayISO);
    }
  }

  function handleDayDragOver(event: React.DragEvent, dayISO: string) {
    if (!canWrite || !draggingIdRef.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    scrollWhileDragging(event);
    setDropDate(dayISO);
  }

  function handleDayDrop(event: React.DragEvent, dayISO: string) {
    if (!canWrite) return;
    event.preventDefault();
    event.stopPropagation();
    suppressDayClickRef.current = true;
    const taskId = event.dataTransfer.getData("text/plain") || draggingIdRef.current;
    if (taskId) moveTaskToDate(taskId, dayISO);
    endTaskDrag();
  }

  const latestActions: CalendarActions = {
    select: onSelect,
    dragTask: beginTaskDrag,
    dragTaskEnd: endTaskDrag,
    dayClick: handleDayClick,
    dayDragOver: handleDayDragOver,
    dayDrop: handleDayDrop,
    openCreator: setCreatingDate,
    expandDay: setExpandedDate,
    setNewTitle,
    submitCreator: (dayISO) => void handleCreateInlineTask(dayISO),
    cancelCreator: () => {
      setCreatingDate(null);
      setNewTitle("");
    },
    setProject: setSelectedProjectId,
  };
  const latestActionsRef = useRef(latestActions);
  latestActionsRef.current = latestActions;
  const actions = useMemo<CalendarActions>(
    () => ({
      select: (id) => latestActionsRef.current.select(id),
      dragTask: (event, taskId) => latestActionsRef.current.dragTask(event, taskId),
      dragTaskEnd: () => latestActionsRef.current.dragTaskEnd(),
      dayClick: (dayISO, isCreating) => latestActionsRef.current.dayClick(dayISO, isCreating),
      dayDragOver: (event, dayISO) => latestActionsRef.current.dayDragOver(event, dayISO),
      dayDrop: (event, dayISO) => latestActionsRef.current.dayDrop(event, dayISO),
      openCreator: (dayISO) => latestActionsRef.current.openCreator(dayISO),
      expandDay: (day) => latestActionsRef.current.expandDay(day),
      setNewTitle: (value) => latestActionsRef.current.setNewTitle(value),
      submitCreator: (dayISO) => latestActionsRef.current.submitCreator(dayISO),
      cancelCreator: () => latestActionsRef.current.cancelCreator(),
      setProject: (id) => latestActionsRef.current.setProject(id),
    }),
    [],
  );

  const showProjectPicker = projects.length > 1 && !projectId;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Asana-style Top Navigation & Filter Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line-subtle bg-base px-4 py-3 text-xs text-faint">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month Stepper & Today */}
          <div className="inline-flex items-center">
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
          <h2 className="text-sm font-medium tracking-tight text-ink">
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
              className="h-8 w-28 rounded-full bg-hover/70 pl-8 pr-7 text-xs text-ink placeholder:text-faint outline-none transition-all focus:w-48 sm:w-36"
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
              "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors",
              showUndated
                ? "bg-hover font-medium text-ink"
                : "text-faint hover:bg-hover hover:text-ink",
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Sem data</span>
            <span
              className="text-[10px] font-semibold text-ink"
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
                "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors",
                activeFiltersCount > 0 || filterOpen
                  ? "bg-hover font-medium text-ink"
                  : "text-faint hover:bg-hover hover:text-ink",
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
      <div className="relative m-4 flex min-h-0 flex-1 overflow-hidden">
        {/* Continuous Scroll Container (Asana-style) */}
        <div
          ref={scrollContainerRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-elevated shadow-xs"
        >
          {/* Sticky Weekday Column Headers. Fundo sólido: desfoque em cabeçalho fixo
              obriga o navegador a repintar o blur em cada quadro do scroll. */}
          <div className="sticky top-0 z-20 grid grid-cols-7 border-b border-line bg-elevated">
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

          {/* Continuous Weeks Grid. Cada semana só renderiza de novo quando algo
              dela muda: datas de criação, soltura e "hoje" só chegam à semana certa. */}
          <div className="divide-y divide-line">
            {weeks.map((week) => {
              const inWeek = (iso: string | null) =>
                iso !== null && iso >= week.start && iso <= week.end;
              const creatingHere = inWeek(creatingDate);
              return (
                <CalendarWeek
                  key={week.start}
                  weekStartISO={week.start}
                  todayISO={inWeek(todayISO) ? todayISO : null}
                  tasksByDay={tasksByDay}
                  subtaskCounts={subtaskCounts}
                  tags={tags}
                  users={users}
                  projects={projects}
                  canWrite={canWrite}
                  creatingDate={creatingHere ? creatingDate : null}
                  newTitle={creatingHere ? newTitle : ""}
                  dropDate={inWeek(dropDate) ? dropDate : null}
                  draggingId={draggingId}
                  selectedId={selectedId ?? null}
                  showProjectPicker={showProjectPicker}
                  targetProjectId={targetProjectId}
                  inlineCreatorRef={inlineCreatorRef}
                  inlineInputRef={inlineInputRef}
                  actions={actions}
                />
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
              Arraste para um dia do calendário, ou clique para abrir.
            </p>

            <div className="mt-3 space-y-2">
              {undatedTasks.length > 0 ? (
                undatedTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable={canWrite}
                    onDragStart={(event) => beginTaskDrag(event, task.id)}
                    onDragEnd={endTaskDrag}
                    className={cn(
                      "group rounded-xl border border-line bg-base/50 p-2.5 transition-all hover:border-line-subtle hover:bg-hover/50 hover:shadow-xs",
                      canWrite && "cursor-grab active:cursor-grabbing",
                      draggingId === task.id && "opacity-40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelect(task.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelect(task.id);
                          }
                        }}
                        className="text-left text-xs font-medium text-ink hover:underline line-clamp-2"
                      >
                        {task.title}
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-1 text-[11px]">
                      {/* Quick Schedule to Today */}
                      <button
                        type="button"
                        onMouseDown={(event) => event.stopPropagation()}
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
          tasks={tasksByDay.get(toISODate(expandedDate)) ?? EMPTY_TASKS}
          tags={tags}
          users={users}
          projects={projects}
          subtaskCounts={subtaskCounts}
          selectedId={selectedId}
          onSelect={onSelect}
          canDrag={canWrite}
          draggingId={draggingId}
          onDragTask={beginTaskDrag}
          onDragTaskEnd={endTaskDrag}
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

// Uma linha de 7 dias do calendário contínuo.
const CalendarWeek = memo(function CalendarWeek({
  weekStartISO,
  todayISO,
  tasksByDay,
  subtaskCounts,
  tags,
  users,
  projects,
  canWrite,
  creatingDate,
  newTitle,
  dropDate,
  draggingId,
  selectedId,
  showProjectPicker,
  targetProjectId,
  inlineCreatorRef,
  inlineInputRef,
  actions,
}: {
  weekStartISO: string;
  todayISO: string | null;
  tasksByDay: Map<string, Task[]>;
  subtaskCounts: Map<string, number>;
  tags: Tag[];
  users: User[];
  projects: Project[];
  canWrite: boolean;
  creatingDate: string | null;
  newTitle: string;
  dropDate: string | null;
  draggingId: string | null;
  selectedId: string | null;
  showProjectPicker: boolean;
  targetProjectId: string;
  inlineCreatorRef: RefObject<HTMLDivElement | null>;
  inlineInputRef: RefObject<HTMLInputElement | null>;
  actions: CalendarActions;
}) {
  const days = useMemo(() => {
    const start = parseDate(weekStartISO);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [weekStartISO]);
  const weekMonthISO = toISODate(startOfMonth(days[3]));

  return (
    <div
      data-week-start={weekStartISO}
      data-week-month={weekMonthISO}
      className="grid grid-cols-7 divide-x divide-line relative"
    >
      {days.map((day, dayIndex) => {
        const isWeekend = dayIndex === 5 || dayIndex === 6;
        const dayISO = toISODate(day);
        const isToday = dayISO === todayISO;
        const isFirstDayOfMonth = day.getDate() === 1;

        const dayTasks = tasksByDay.get(dayISO) ?? EMPTY_TASKS;

        const isCreating = creatingDate === dayISO;
        const maxVisible = 3;
        const visibleTasks = dayTasks.slice(0, maxVisible);
        const extraTasksCount = dayTasks.length - maxVisible;

        return (
          <div
            key={dayISO}
            id={`day-${dayISO}`}
            data-date={dayISO}
            onClick={() => actions.dayClick(dayISO, isCreating)}
            onDragOver={(event) => actions.dayDragOver(event, dayISO)}
            onDrop={(event) => actions.dayDrop(event, dayISO)}
            className={cn(
              "group relative min-h-[160px] sm:min-h-[175px] p-1.5 sm:p-2 transition-colors",
              canWrite ? "cursor-copy" : undefined,
              isWeekend ? "bg-base/25 dark:bg-black/20" : "bg-elevated",
              "hover:bg-hover/30",
              dropDate === dayISO && "bg-blue-500/15 ring-2 ring-inset ring-blue-400/70",
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
                  day.getDate()
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
                    actions.openCreator(dayISO);
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
                  subtasksCount={subtaskCounts.get(task.id) ?? 0}
                  selected={selectedId === task.id}
                  onSelect={actions.select}
                  canDrag={canWrite}
                  dragging={draggingId === task.id}
                  onDragTask={actions.dragTask}
                  onDragTaskEnd={actions.dragTaskEnd}
                />
              ))}

              {/* Inline Task Creator */}
              {isCreating ? (
                <div
                  ref={inlineCreatorRef}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-xl border border-line bg-elevated p-2 shadow-lg animate-in fade-in zoom-in-95 duration-100 text-left"
                >
                  <input
                    ref={inlineInputRef}
                    type="text"
                    value={newTitle}
                    onChange={(e) => actions.setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        actions.submitCreator(dayISO);
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        actions.cancelCreator();
                      }
                    }}
                    placeholder="Nome da tarefa..."
                    className="w-full bg-transparent text-xs font-medium text-ink placeholder:text-faint outline-none"
                  />
                  {showProjectPicker ? (
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <select
                        value={targetProjectId}
                        onChange={(e) => actions.setProject(e.target.value)}
                        className="max-w-[120px] truncate bg-transparent text-[10px] text-faint outline-none hover:text-ink"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id} className="bg-elevated text-ink">
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* "+N mais" button if day has overflow */}
              {extraTasksCount > 0 ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.expandDay(day);
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
                    actions.openCreator(dayISO);
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
});

// Asana-Style Task Card for Calendar
const CalendarTaskCard = memo(function CalendarTaskCard({
  task,
  tags,
  users,
  projects,
  subtasksCount,
  selected = false,
  onSelect,
  canDrag = false,
  dragging = false,
  onDragTask,
  onDragTaskEnd,
}: {
  task: Task;
  tags: Tag[];
  users: User[];
  projects: Project[];
  subtasksCount: number;
  selected?: boolean;
  onSelect: (id: string) => void;
  canDrag?: boolean;
  dragging?: boolean;
  onDragTask?: (event: React.DragEvent, taskId: string) => void;
  onDragTaskEnd?: () => void;
}) {
  const isDone = task.status === "done";
  const assignee = users.find((u) => u.id === task.assigneeId);
  const taskTags = tags.filter((t) => task.tagIds?.includes(t.id));
  const primaryTag = taskTags[0];
  const project = projects.find((p) => p.id === task.projectId);

  // Card color priority: primary tag color -> project color -> neutral
  const color = primaryTag?.color ?? project?.color ?? "#8b5cf6";

  const draggedRef = useRef(false);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={canDrag}
      onDragStart={(event) => {
        if (!canDrag) return;
        draggedRef.current = true;
        event.stopPropagation();
        onDragTask?.(event, task.id);
      }}
      onDragEnd={(event) => {
        event.stopPropagation();
        onDragTaskEnd?.();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        onSelect(task.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(task.id);
        }
      }}
      className={cn(
        "group/task relative flex w-full items-start gap-1.5 rounded-lg border px-2.5 py-0.5 sm:py-1 text-left text-xs transition-all duration-150 min-h-[30px]",
        "border-black/10 dark:border-white/10 shadow-2xs hover:shadow-xs hover:brightness-95 dark:hover:brightness-110",
        canDrag && "cursor-grab active:cursor-grabbing",
        selected && "ring-2 ring-ink ring-offset-1 ring-offset-elevated",
        (isDone || dragging) && "opacity-60",
      )}
      style={{
        backgroundColor: `${color}25`,
        borderLeftWidth: "3.5px",
        borderLeftColor: color,
      }}
    >
      <button
        type="button"
        aria-label={isDone ? "Marcar como a fazer" : "Marcar como concluída"}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setTaskStatus(task.id, isDone ? "todo" : "done");
        }}
        className={cn(
          "peer absolute left-2.5 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full transition-opacity",
          "pointer-events-none opacity-0",
          "group-hover/task:pointer-events-auto group-hover/task:opacity-100",
          "focus-visible:pointer-events-auto focus-visible:opacity-100",
          isDone
            ? "bg-emerald-600 text-white"
            : "border border-ink/40 bg-elevated hover:border-ink",
        )}
      >
        {isDone ? <Check className="h-3 w-3 stroke-[3]" /> : null}
      </button>

      {assignee ? (
        <span className="shrink-0 self-center transition-opacity group-hover/task:opacity-0 peer-focus-visible:opacity-0 [&_img]:h-5 [&_img]:w-5 [&_span]:h-5 [&_span]:w-5 [&_span]:text-[9px]">
          <Avatar
            initials={assignee.initials}
            src={assignee.avatar}
            name={assignee.name}
            size="xs"
          />
        </span>
      ) : null}

      <span
        className={cn(
          "min-w-0 flex-1 line-clamp-2 font-medium text-ink leading-tight break-words",
          !assignee && "transition-[padding] duration-150 group-hover/task:pl-6 peer-focus-visible:pl-6",
          isDone && "line-through text-faint",
        )}
        title={task.title}
      >
        {task.title}
      </span>

      {/* Subtasks Count Icon */}
      {subtasksCount > 0 ? (
        <span
          className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-faint font-medium mt-0.5"
          title={`${subtasksCount} subtarefa(s)`}
        >
          <GitFork className="h-2.5 w-2.5 text-faint" />
          <span>{subtasksCount}</span>
        </span>
      ) : null}

      {/* Extra Tag Color Dots */}
      {taskTags.length > 1 ? (
        <div className="flex items-center gap-0.5 shrink-0 mt-1">
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
});

// Modal for days with many tasks ("+N mais")
function DayTasksModal({
  date,
  tasks,
  tags,
  users,
  projects,
  subtaskCounts,
  selectedId,
  onSelect,
  canDrag,
  draggingId,
  onDragTask,
  onDragTaskEnd,
  onClose,
  onAddTask,
}: {
  date: Date;
  tasks: Task[];
  tags: Tag[];
  users: User[];
  projects: Project[];
  subtaskCounts: Map<string, number>;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  canDrag?: boolean;
  draggingId?: string | null;
  onDragTask?: (event: React.DragEvent, taskId: string) => void;
  onDragTaskEnd?: () => void;
  onClose: () => void;
  onAddTask: () => void;
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4",
        draggingId && "pointer-events-none opacity-0",
      )}
    >
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
              subtasksCount={subtaskCounts.get(task.id) ?? 0}
              selected={selectedId === task.id}
              canDrag={canDrag}
              dragging={draggingId === task.id}
              onDragTask={onDragTask}
              onDragTaskEnd={onDragTaskEnd}
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
