"use client";

import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  isSameDay,
  max,
  min,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect, useRef, type RefObject } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { parseDate } from "@/lib/dates";
import type { Tag, Task, User } from "@/lib/types";

const DAY = 40;
const LABEL = 280;
const HEADER = 76;
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

export function ProjectTimeline({
  tasks,
  tags,
  users,
  sections,
  accent,
  selectedId,
  onSelect,
}: {
  tasks: Task[];
  tags: Tag[];
  users: User[];
  sections: string[];
  accent: string;
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const groups = groupBySection(tasks, sections);
  const dated = groups.flatMap((group) => group.rows);
  if (dated.length === 0) {
    return <p className="px-6 py-10 text-sm text-faint">Nenhuma tarefa com data.</p>;
  }

  const today = startOfDay(new Date());
  const starts = dated.map((task) => taskStart(task));
  const ends = dated.map((task) => taskEnd(task));
  const rangeStart = startOfWeek(addDays(min([...starts, today]), -1), { weekStartsOn: 1 });
  const rangeEnd = endOfWeek(addDays(max([...ends, today]), 2), { weekStartsOn: 1 });
  const totalDays = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  const ticks = Array.from({ length: totalDays }, (_, index) => addDays(rangeStart, index));
  const todayIndex = differenceInCalendarDays(today, rangeStart);
  const months = monthGroups(ticks);

  return (
    <TimelineFrame
      scrollerRef={scrollerRef}
      todayIndex={todayIndex}
      totalDays={totalDays}
    >
      <div className="sticky top-0 z-20 flex border-b border-line-subtle bg-base">
        <div
          className="sticky left-0 z-30 flex shrink-0 items-end border-r border-line-subtle bg-base px-4 pb-3"
          style={{ width: LABEL, height: HEADER }}
        >
          <p className="text-xs text-faint">Tarefas</p>
        </div>
        <div className="relative" style={{ width: totalDays * DAY, height: HEADER }}>
          <div className="absolute inset-x-0 top-0 flex h-8">
            {months.map((month) => (
              <div key={month.label + month.start} className="shrink-0" style={{ width: month.span * DAY }}>
                <span
                  className="sticky z-10 inline-block bg-base px-2 py-1.5 text-xs text-faint"
                  style={{ left: LABEL }}
                >
                  {month.label}
                </span>
              </div>
            ))}
          </div>
          {todayIndex >= 0 ? (
            <span
              aria-hidden
              className="absolute bottom-0 z-10 w-px"
              style={{
                left: todayIndex * DAY + DAY / 2,
                height: 46,
                backgroundColor: accent,
              }}
            />
          ) : null}
          <div className="absolute inset-x-0 bottom-0 flex h-11">
            {ticks.map((tick) => {
              const weekend = tick.getDay() === 0 || tick.getDay() === 6;
              const current = isSameDay(tick, today);
              return (
                <div
                  key={tick.toISOString()}
                  className="flex w-10 shrink-0 flex-col items-center justify-center"
                >
                  <span
                    className={cn(
                      "text-[10px]",
                      current ? "font-medium" : weekend ? "text-faint" : "text-muted",
                    )}
                    style={current ? { color: accent } : undefined}
                  >
                    {current ? "Hoje" : WEEKDAYS[tick.getDay()]}
                  </span>
                  <span
                    className={cn("text-xs", current && "font-medium")}
                    style={current ? { color: accent } : undefined}
                  >
                    {tick.getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative min-h-[calc(100%-76px)]">
        <div className="pointer-events-none absolute inset-y-0" style={{ left: LABEL, width: totalDays * DAY }}>
          {ticks.map((tick, index) => {
            const weekend = tick.getDay() === 0 || tick.getDay() === 6;
            const monday = tick.getDay() === 1;
            return (
              <div
                key={tick.toISOString()}
                className={cn(
                  "absolute inset-y-0 border-r border-line-subtle",
                  weekend && "bg-hover/40",
                  monday && "border-l border-line",
                )}
                style={{ left: index * DAY, width: DAY }}
              />
            );
          })}
        </div>

        {todayIndex >= 0 ? (
          <div
            className="pointer-events-none absolute bottom-0 z-[5] w-px"
            style={{
              left: LABEL + todayIndex * DAY + DAY / 2,
              top: 0,
              backgroundColor: accent,
            }}
          />
        ) : null}

        {groups.map((group) => (
          <section key={group.name}>
            <div className="flex h-10 border-b border-line-subtle">
              <div
                className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line-subtle bg-base px-4"
                style={{ width: LABEL }}
              >
                <span className="truncate text-xs font-medium text-ink">{group.name}</span>
                <span className="text-[11px] text-faint">{group.rows.length}</span>
              </div>
              <div className="flex-1" />
            </div>
            {group.rows.map((task) => (
              <TimelineRow
                key={task.id}
                task={task}
                tasks={tasks}
                tags={tags}
                users={users}
                accent={accent}
                rangeStart={rangeStart}
                selected={selectedId === task.id}
                onSelect={onSelect}
              />
            ))}
          </section>
        ))}
      </div>
    </TimelineFrame>
  );
}

function TimelineFrame({
  scrollerRef,
  todayIndex,
  totalDays,
  children,
}: {
  scrollerRef: RefObject<HTMLDivElement | null>;
  todayIndex: number;
  totalDays: number;
  children: React.ReactNode;
}) {
  const placed = useRef(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || placed.current || todayIndex < 0) return;
    placed.current = true;
    el.scrollLeft = Math.max(0, LABEL + todayIndex * DAY + DAY / 2 - el.clientWidth * 0.68);
  }, [scrollerRef, todayIndex]);

  return (
    <div ref={scrollerRef} className="h-full overflow-auto">
      <div className="relative min-h-full" style={{ width: LABEL + totalDays * DAY }}>
        {children}
      </div>
    </div>
  );
}

function TimelineRow({
  task,
  tasks,
  tags,
  users,
  accent,
  rangeStart,
  selected,
  onSelect,
}: {
  task: Task;
  tasks: Task[];
  tags: Tag[];
  users: User[];
  accent: string;
  rangeStart: Date;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const child = Boolean(task.parentId);
  const start = taskStart(task);
  const end = taskEnd(task);
  const offset = differenceInCalendarDays(start, rangeStart);
  const span = Math.max(differenceInCalendarDays(end, start) + 1, 1);
  const width = Math.max(span * DAY - 8, 28);
  const color = taskColor(task, tasks, tags, accent);
  const person = users.find((user) => user.id === task.assigneeId);
  const showCopy = !child && width >= 108;
  const showAvatar = Boolean(showCopy && person && width >= 156);

  return (
    <div className={cn("group flex border-b border-line-subtle", child ? "h-10" : "h-14")}>
      <button
        type="button"
        onClick={() => onSelect(task.id)}
        title={task.title}
        className={cn(
          "sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line-subtle bg-base px-4 text-left group-hover:bg-hover",
          selected && "bg-elevated",
          child && "pl-8",
        )}
        style={{ width: LABEL }}
      >
        <span
          className={cn("shrink-0 rounded-full", child ? "h-1.5 w-1.5" : "h-2 w-2")}
          style={{ backgroundColor: color }}
        />
        <span className="min-w-0">
          <span
            className={cn(
              "block truncate text-sm",
              task.status === "done" ? "text-faint" : "text-ink",
            )}
          >
            {task.title}
          </span>
          {child ? null : (
            <span className="block truncate text-[11px] text-faint">{formatRange(start, end)}</span>
          )}
        </span>
      </button>
      <div className="relative min-w-0 flex-1">
        <button
          type="button"
          aria-label={task.title}
          onClick={() => onSelect(task.id)}
          className={cn(
            "absolute top-1/2 flex -translate-y-1/2 items-center gap-2 overflow-hidden text-left",
            child
              ? "h-7 rounded-full px-3"
              : "h-11 rounded-xl border border-line bg-hover px-3",
            selected && "ring-1 ring-ink",
            task.status === "done" && "opacity-60",
          )}
          style={{
            left: offset * DAY + 4,
            width,
            backgroundColor: child ? `${color}33` : undefined,
          }}
        >
          {child ? null : (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          )}
          {showCopy ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-ink">{task.title}</span>
              {task.description ? (
                <span className="block truncate text-[11px] text-faint">{task.description}</span>
              ) : null}
            </span>
          ) : child && width >= 96 ? (
            <span className="truncate text-[11px] text-muted">{task.title}</span>
          ) : null}
          {showAvatar && person ? (
            <Avatar
              initials={person.initials}
              src={person.avatar}
              name={person.name}
              size="sm"
            />
          ) : null}
        </button>
      </div>
    </div>
  );
}

function groupBySection(tasks: Task[], sections: string[]) {
  const names = sections.length > 0 ? [...sections] : ["Geral"];
  for (const task of tasks) {
    if (task.dueDate && task.section && !names.includes(task.section)) names.push(task.section);
  }
  return names
    .map((name) => {
      const inSection = tasks.filter((task) => task.section === name && task.dueDate);
      const ids = new Set(inSection.map((task) => task.id));
      const roots = inSection
        .filter((task) => !task.parentId || !ids.has(task.parentId))
        .slice()
        .sort((a, b) => taskStart(a).getTime() - taskStart(b).getTime() || (a.order ?? 0) - (b.order ?? 0));
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

function formatRange(start: Date, end: Date) {
  if (isSameDay(start, end)) return format(start, "d MMM", { locale: ptBR });
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${format(start, "d")}–${format(end, "d MMM", { locale: ptBR })}`;
  }
  return `${format(start, "d MMM", { locale: ptBR })} – ${format(end, "d MMM", { locale: ptBR })}`;
}
