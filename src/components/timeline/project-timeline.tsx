"use client";

import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  endOfWeek,
  format,
  getISOWeek,
  isSameDay,
  startOfDay,
  startOfWeek,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { CheckCircle2, ChevronRight, Circle, GitBranch } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  DEFAULT_TIMELINE_OPTIONS,
  TimelineToolbar,
  type TimelineOptions,
  type TimelineSort,
} from "@/components/timeline/timeline-toolbar";
import { cn } from "@/lib/cn";
import { SECTION_FILTER_ALL } from "@/components/projects/section-bar";
import { parseDate } from "@/lib/dates";
import { EMPTY_FILTERS, filterTasks, isFiltering } from "@/lib/task-filters";
import type { Priority, Tag, Task, User } from "@/lib/types";

const LABEL = 260;
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

export function ProjectTimeline({
  tasks,
  tags,
  users,
  sections,
  activeSection,
  onSectionChange,
  accent,
  selectedId,
  onSelect,
}: {
  tasks: Task[];
  tags: Tag[];
  users: User[];
  sections: string[];
  activeSection: string;
  onSectionChange: (section: string) => void;
  accent: string;
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const [focusDate, setFocusDate] = useState(() => startOfDay(new Date()));
  const [visibleWeeks, setVisibleWeeks] = useState(12);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState<TimelineSort>("due");
  const [options, setOptions] = useState<TimelineOptions>(DEFAULT_TIMELINE_OPTIONS);

  const showAll = activeSection === SECTION_FILTER_ALL;
  const sectionScoped = useMemo(
    () =>
      showAll
        ? tasks
        : tasks.filter((task) => resolveTaskSection(task, sections) === activeSection),
    [tasks, showAll, activeSection, sections],
  );

  const undatedCount = useMemo(
    () => sectionScoped.filter((task) => !task.dueDate).length,
    [sectionScoped],
  );

  const processedTasks = useMemo(() => {
    let list = filterTasks(sectionScoped, filters, "tree");
    if (!options.showCompleted) {
      list = list.filter((task) => task.status !== "done");
    }
    return list;
  }, [sectionScoped, filters, options.showCompleted]);

  const showingUndatedOnly = filters.date === "undated";
  const timelineTasks = useMemo(
    () =>
      showingUndatedOnly
        ? processedTasks.filter((task) => !task.dueDate)
        : processedTasks.filter((task) => Boolean(task.dueDate)),
    [processedTasks, showingUndatedOnly],
  );

  const groups = useMemo(
    () =>
      groupBySection(
        timelineTasks,
        showAll ? sections : [activeSection],
        sort,
        showingUndatedOnly,
      ),
    [timelineTasks, showAll, sections, activeSection, sort, showingUndatedOnly],
  );

  const dated = groups.flatMap((group) => group.rows);

  const today = startOfDay(new Date());
  const half = Math.floor(visibleWeeks / 2);
  const rangeStart = startOfWeek(subWeeks(focusDate, half), { weekStartsOn: 1 });
  const rangeEnd = endOfWeek(addWeeks(rangeStart, visibleWeeks - 1), { weekStartsOn: 1 });
  const allTicks = useMemo(
    () =>
      Array.from(
        { length: differenceInCalendarDays(rangeEnd, rangeStart) + 1 },
        (_, index) => addDays(rangeStart, index),
      ),
    [rangeEnd, rangeStart],
  );
  const ticks = useMemo(
    () =>
      options.showWeekends
        ? allTicks
        : allTicks.filter((tick) => tick.getDay() !== 0 && tick.getDay() !== 6),
    [allTicks, options.showWeekends],
  );
  const totalDays = ticks.length;
  const dayWidth = useMemo(
    () => Math.max(16, Math.min(56, Math.round(440 / Math.max(visibleWeeks, 4)))),
    [visibleWeeks],
  );
  const timelineWidth = totalDays * dayWidth;
  const todayIndex = ticks.findIndex((tick) => isSameDay(tick, today));
  const months = monthGroups(ticks);
  const weeks = weekGroups(ticks);
  const scrollRef = useRef<HTMLDivElement>(null);
  const placedScroll = useRef(false);

  const scrollToToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el || todayIndex < 0) return;
    const center = LABEL + (todayIndex + 0.5) * dayWidth;
    el.scrollLeft = Math.max(0, center - el.clientWidth * 0.42);
  }, [todayIndex, dayWidth]);

  useEffect(() => {
    if (placedScroll.current || dated.length === 0) return;
    placedScroll.current = true;
    scrollToToday();
  }, [dated.length, scrollToToday]);

  if (dated.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <TimelineToolbar
          undatedCount={undatedCount}
          visibleWeeks={visibleWeeks}
          filters={filters}
          sort={sort}
          options={options}
          filterActive={isFiltering(filters)}
          onPrev={() => setFocusDate((date) => subWeeks(date, 1))}
          onNext={() => setFocusDate((date) => addWeeks(date, 1))}
          onToday={() => {
            setFocusDate(startOfDay(new Date()));
            requestAnimationFrame(() => scrollToToday());
          }}
          onZoomIn={() => setVisibleWeeks((weeks) => Math.max(4, weeks - 2))}
          onZoomOut={() => setVisibleWeeks((weeks) => Math.min(26, weeks + 2))}
          onFiltersChange={setFilters}
          onSortChange={setSort}
          onOptionsChange={setOptions}
          onUndatedClick={() =>
            setFilters((current) => ({
              ...current,
              date: current.date === "undated" ? "all" : "undated",
            }))
          }
          users={users}
          tags={tags}
          sections={sections}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
        />
        <p className="px-6 py-10 text-sm text-faint">
          {showingUndatedOnly
            ? "Nenhuma tarefa sem data nesta sessão."
            : "Nenhuma tarefa com data no período ou filtros atuais."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TimelineToolbar
        undatedCount={undatedCount}
        visibleWeeks={visibleWeeks}
        filters={filters}
        sort={sort}
        options={options}
        filterActive={isFiltering(filters)}
        onPrev={() => setFocusDate((date) => subWeeks(date, 1))}
        onNext={() => setFocusDate((date) => addWeeks(date, 1))}
        onToday={() => {
          setFocusDate(startOfDay(new Date()));
          requestAnimationFrame(() => scrollToToday());
        }}
        onZoomIn={() => setVisibleWeeks((weeks) => Math.max(4, weeks - 2))}
        onZoomOut={() => setVisibleWeeks((weeks) => Math.min(26, weeks + 2))}
        onFiltersChange={setFilters}
        onSortChange={setSort}
        onOptionsChange={setOptions}
        onUndatedClick={() =>
          setFilters((current) => ({
            ...current,
            date: current.date === "undated" ? "all" : "undated",
          }))
        }
        sections={sections}
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        users={users}
        tags={tags}
      />
      <TimelineScrollArea scrollRef={scrollRef}>
        <div className="relative min-h-full" style={{ width: LABEL + timelineWidth }}>
          <div className="sticky top-0 z-20 flex border-b border-line-subtle bg-base">
            <div
              className="sticky left-0 z-30 shrink-0 border-r border-line-subtle bg-base px-4 pb-2 pt-3"
              style={{ width: LABEL }}
            >
              <p className="text-xs text-faint">Tarefas</p>
            </div>
            <div className="relative shrink-0" style={{ width: timelineWidth }}>
              <div className="relative h-7 border-b border-line-subtle">
                {months.map((month) => (
                  <div
                    key={`${month.label}-${month.start}`}
                    className="absolute inset-y-0 flex items-center border-r border-line-subtle px-2"
                    style={{
                      left: month.start * dayWidth,
                      width: month.span * dayWidth,
                    }}
                  >
                    <span className="truncate text-[11px] font-medium capitalize text-muted">
                      {month.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex h-7 border-b border-line-subtle">
                {weeks.map((week) => (
                  <div
                    key={week.key}
                    className="flex shrink-0 flex-col justify-center border-r border-line-subtle px-1"
                    style={{ width: week.span * dayWidth }}
                  >
                    <span className="truncate text-[10px] text-faint">S{week.week}</span>
                    <span className="truncate text-[10px] text-muted">{week.rangeLabel}</span>
                  </div>
                ))}
              </div>
              <div className="relative flex h-10">
                {ticks.map((tick) => {
                  const weekend = tick.getDay() === 0 || tick.getDay() === 6;
                  const current = isSameDay(tick, today);
                  return (
                    <div
                      key={tick.toISOString()}
                      className={cn(
                        "flex shrink-0 flex-col items-center justify-center border-r border-line-subtle",
                        weekend && "bg-hover/30",
                      )}
                      style={{ width: dayWidth }}
                    >
                      <span
                        className={cn(
                          "truncate text-[9px] leading-none",
                          current ? "font-semibold" : weekend ? "text-faint" : "text-muted",
                        )}
                        style={current ? { color: accent } : undefined}
                      >
                        {current ? "Hoje" : WEEKDAYS[tick.getDay()]}
                      </span>
                      <span
                        className={cn("text-[10px] leading-tight", current && "font-semibold")}
                        style={current ? { color: accent } : undefined}
                      >
                        {tick.getDate()}
                      </span>
                    </div>
                  );
                })}
                {todayIndex >= 0 ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-0 z-10 w-0.5"
                    style={{
                      left: (todayIndex + 0.5) * dayWidth,
                      height: "100%",
                      backgroundColor: accent,
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="relative">
            <div
              className="pointer-events-none absolute inset-y-0 flex"
              style={{ left: LABEL, width: timelineWidth }}
            >
              {ticks.map((tick) => {
                const weekend = tick.getDay() === 0 || tick.getDay() === 6;
                const monday = tick.getDay() === 1;
                return (
                  <div
                    key={tick.toISOString()}
                    className={cn(
                      "h-full shrink-0 border-r border-line-subtle",
                      weekend && "bg-hover/25",
                      monday && "border-l border-line",
                    )}
                    style={{ width: dayWidth }}
                  />
                );
              })}
            </div>

            {todayIndex >= 0 ? (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-[5] w-0.5"
                style={{
                  left: LABEL + (todayIndex + 0.5) * dayWidth,
                  backgroundColor: accent,
                }}
              />
            ) : null}

            {groups.map((group) => (
              <section key={group.name}>
                <div className="flex h-9 border-b border-line-subtle bg-base/80">
                  <div
                    className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line-subtle bg-base px-4"
                    style={{ width: LABEL }}
                  >
                    <span className="truncate text-xs font-medium text-ink">{group.name}</span>
                    <span className="text-[11px] text-faint">{group.rows.length}</span>
                  </div>
                  <div className="shrink-0" style={{ width: timelineWidth }} />
                </div>
                {group.rows.map((task) => (
                  <TimelineRow
                    key={task.id}
                    task={task}
                    tasks={tasks}
                    tags={tags}
                    users={users}
                    accent={accent}
                    ticks={ticks}
                    dayWidth={dayWidth}
                    timelineWidth={timelineWidth}
                    selected={selectedId === task.id}
                    onSelect={onSelect}
                  />
                ))}
              </section>
            ))}
          </div>
        </div>
      </TimelineScrollArea>
    </div>
  );
}

function TimelineScrollArea({
  scrollRef,
  children,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const pan = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  });

  function endPan(event?: PointerEvent<HTMLDivElement>) {
    if (!pan.current.active) return;
    pan.current.active = false;
    const el = scrollRef.current;
    if (event && el?.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-auto cursor-grab active:cursor-grabbing [scrollbar-gutter:stable]"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("button, a, input, textarea, select, [data-timeline-task]")) return;
        const el = scrollRef.current;
        if (!el) return;
        pan.current = {
          active: true,
          startX: event.clientX,
          startY: event.clientY,
          startScrollLeft: el.scrollLeft,
          startScrollTop: el.scrollTop,
        };
        el.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!pan.current.active || !scrollRef.current) return;
        const dx = event.clientX - pan.current.startX;
        const dy = event.clientY - pan.current.startY;
        scrollRef.current.scrollLeft = pan.current.startScrollLeft - dx;
        scrollRef.current.scrollTop = pan.current.startScrollTop - dy;
      }}
      onPointerUp={(event) => endPan(event)}
      onPointerCancel={(event) => endPan(event)}
    >
      {children}
    </div>
  );
}

function TimelineRow({
  task,
  tasks,
  tags,
  users,
  accent,
  ticks,
  dayWidth,
  timelineWidth,
  selected,
  onSelect,
}: {
  task: Task;
  tasks: Task[];
  tags: Tag[];
  users: User[];
  accent: string;
  ticks: Date[];
  dayWidth: number;
  timelineWidth: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const child = Boolean(task.parentId);
  const depth = child ? 1 : 0;
  const childCount = tasks.filter((item) => item.parentId === task.id).length;
  const hasChildren = childCount > 0;
  const done = task.status === "done";
  const start = taskStart(task);
  const end = taskEnd(task);
  const { startIdx, span } = timelinePosition(ticks, start, end);
  const barLeft = startIdx * dayWidth;
  const barWidth = Math.max(span * dayWidth - 6, 28);
  const color = taskColor(task, tasks, tags, accent);
  const person = users.find((user) => user.id === task.assigneeId);
  const dueLabel = task.dueDate
    ? `Prazo: ${format(parseDate(task.dueDate), "d MMM", { locale: ptBR }).replace(/\./g, "")}`
    : null;
  const indentPx = depth * 24;

  return (
    <div
      className={cn(
        "group flex border-b border-line-subtle",
        child ? "h-11" : "h-[52px]",
      )}
    >
      <div
        className={cn(
          "sticky left-0 z-10 shrink-0 border-r border-line-subtle bg-base",
          selected && "bg-elevated",
        )}
        style={{ width: LABEL }}
      >
        <div className="relative h-full">
          {child ? (
            <>
              <span
                aria-hidden
                className="absolute bottom-0 top-0 border-l border-line"
                style={{ left: 22 }}
              />
              <span
                aria-hidden
                className="absolute top-1/2 h-px w-3 border-t border-line"
                style={{ left: 22 }}
              />
            </>
          ) : null}
        </div>
      </div>
      <div className="relative shrink-0 py-1" style={{ width: timelineWidth }}>
        <button
          type="button"
          data-timeline-task
          aria-label={task.title}
          onClick={() => onSelect(task.id)}
          className={cn(
            "absolute top-1/2 flex -translate-y-1/2 items-center gap-2 overflow-hidden rounded-lg border text-left transition-colors",
            child ? "h-9 min-w-[140px] px-1.5" : "h-10 min-w-[180px] px-2",
            done
              ? "border-line-subtle/60 bg-hover/35 opacity-55"
              : "border-line-subtle/90 bg-elevated hover:bg-hover/60",
            selected && "ring-1 ring-ink/80",
          )}
          style={{
            left: barLeft + indentPx + 2,
            width: Math.max(barWidth - indentPx, child ? 140 : 180),
            maxWidth: timelineWidth - barLeft - indentPx - 4,
            backgroundColor: done
              ? undefined
              : child
                ? `color-mix(in srgb, ${color} 18%, var(--bg-elevated))`
                : `color-mix(in srgb, ${color} 10%, var(--bg-elevated))`,
          }}
        >
          <span
            aria-hidden
            className={cn("shrink-0 rounded-full", child ? "h-6 w-1.5" : "h-7 w-2")}
            style={
              done
                ? { boxShadow: `inset 0 0 0 2px ${color}`, backgroundColor: "transparent" }
                : { backgroundColor: color }
            }
          />
          {hasChildren ? (
            <ChevronRight className="h-3 w-3 shrink-0 text-faint" strokeWidth={2.25} aria-hidden />
          ) : null}
          {person ? (
            <Avatar
              initials={person.initials}
              src={person.avatar}
              name={person.name}
              size="sm"
            />
          ) : (
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-muted"
              style={{ backgroundColor: `color-mix(in srgb, ${color} 35%, var(--bg-hover))` }}
            >
              —
            </span>
          )}
          {done ? (
            <CheckCircle2
              className="h-4 w-4 shrink-0 text-faint"
              strokeWidth={1.75}
              aria-hidden
            />
          ) : (
            <Circle className="h-4 w-4 shrink-0 text-faint/45" strokeWidth={1.5} aria-hidden />
          )}
          <span className="min-w-0 flex-1 pr-1">
            <span
              className={cn(
                "block truncate text-[13px] leading-tight",
                done ? "text-muted" : "text-ink",
              )}
            >
              {task.title}
            </span>
            {dueLabel ? (
              <span className="mt-0.5 block truncate text-[11px] leading-tight text-faint">
                {dueLabel}
              </span>
            ) : null}
          </span>
          {hasChildren ? (
            <span className="mr-0.5 flex shrink-0 items-center gap-0.5 text-faint">
              <GitBranch className="h-3 w-3" strokeWidth={2} aria-hidden />
              <span className="text-[10px] tabular-nums">{childCount}</span>
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}

function resolveTaskSection(task: Task, sections: string[]) {
  const fallback = sections[0] ?? "Geral";
  if (task.section && sections.includes(task.section)) return task.section;
  return fallback;
}

const PRIORITY_RANK: Record<Priority, number> = {
  urgente: 0,
  alta: 1,
  media: 2,
  baixa: 3,
};

function sortRoots(roots: Task[], sort: TimelineSort) {
  return roots.slice().sort((a, b) => {
    switch (sort) {
      case "title":
        return a.title.localeCompare(b.title, "pt-BR");
      case "priority":
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      case "created":
        return a.createdAt.localeCompare(b.createdAt);
      case "start":
        return taskStart(a).getTime() - taskStart(b).getTime();
      case "due":
      default:
        return (
          taskStart(a).getTime() - taskStart(b).getTime() || (a.order ?? 0) - (b.order ?? 0)
        );
    }
  });
}

function timelinePosition(ticks: Date[], start: Date, end: Date) {
  if (ticks.length === 0) return { startIdx: 0, span: 1 };
  const s = startOfDay(start).getTime();
  const e = startOfDay(end).getTime();
  let startIdx = ticks.findIndex((tick) => startOfDay(tick).getTime() >= s);
  if (startIdx < 0) startIdx = ticks.length - 1;
  let endIdx = -1;
  for (let index = ticks.length - 1; index >= 0; index -= 1) {
    if (startOfDay(ticks[index]).getTime() <= e) {
      endIdx = index;
      break;
    }
  }
  if (endIdx < startIdx) endIdx = startIdx;
  return { startIdx, span: Math.max(endIdx - startIdx + 1, 1) };
}

function groupBySection(
  tasks: Task[],
  sections: string[],
  sort: TimelineSort,
  undatedOnly: boolean,
) {
  const names = sections.length > 0 ? [...sections] : ["Geral"];
  for (const task of tasks) {
    const name = resolveTaskSection(task, names);
    if (!names.includes(name)) names.push(name);
  }
  return names
    .map((name) => {
      const inSection = tasks.filter((task) => {
        if (resolveTaskSection(task, names) !== name) return false;
        return undatedOnly ? !task.dueDate : Boolean(task.dueDate);
      });
      const ids = new Set(inSection.map((task) => task.id));
      const roots = sortRoots(
        inSection.filter((task) => !task.parentId || !ids.has(task.parentId)),
        sort,
      );
      const rows = roots.flatMap((task) => [
        task,
        ...inSection
          .filter((child) => child.parentId === task.id)
          .slice()
          .sort((a, b) => taskStart(a).getTime() - taskStart(b).getTime()),
      ]);
      return { name, rows };
    })
    .filter((group) => group.rows.length > 0);
}

function monthGroups(ticks: Date[]) {
  const groups: { label: string; start: number; span: number }[] = [];
  ticks.forEach((tick, index) => {
    const raw = format(tick, "MMMM", { locale: ptBR });
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    const last = groups[groups.length - 1];
    if (!last || last.label !== label) groups.push({ label, start: index, span: 1 });
    else last.span += 1;
  });
  return groups;
}

function weekGroups(ticks: Date[]) {
  const groups: {
    key: string;
    span: number;
    week: number;
    rangeLabel: string;
  }[] = [];
  ticks.forEach((tick) => {
    const weekStart = startOfWeek(tick, { weekStartsOn: 1 });
    const key = format(weekStart, "yyyy-MM-dd");
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) {
      const weekEnd = endOfWeek(tick, { weekStartsOn: 1 });
      groups.push({
        key,
        span: 1,
        week: getISOWeek(tick),
        rangeLabel: formatWeekRange(weekStart, weekEnd),
      });
    } else {
      last.span += 1;
    }
  });
  return groups;
}

function formatWeekRange(start: Date, end: Date) {
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${format(start, "d")}–${format(end, "d")}`;
  }
  const a = format(start, "d MMM", { locale: ptBR }).replace(/\./g, "");
  const b = format(end, "d MMM", { locale: ptBR }).replace(/\./g, "");
  return `${a} – ${b}`;
}

function taskStart(task: Task) {
  return startOfDay(parseDate(task.startDate ?? task.dueDate ?? task.createdAt));
}

function taskEnd(task: Task) {
  return startOfDay(parseDate(task.dueDate ?? task.startDate ?? task.createdAt));
}

function taskColor(task: Task, tasks: Task[], tags: Tag[], accent: string) {
  const source = task.tagIds[0] ? task : tasks.find((item) => item.id === task.parentId);
  const tag = tags.find((item) => item.id === source?.tagIds[0]);
  return tag?.color ?? accent;
}
