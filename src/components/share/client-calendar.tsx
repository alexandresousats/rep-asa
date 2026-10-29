"use client";

import { format, isSameMonth, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarRange, List } from "lucide-react";
import { memo, useMemo, useState } from "react";
import { attachmentUrl, type PublicTask } from "@/lib/api/public-share";
import { cn } from "@/lib/cn";
import { monthGrid, parseDate, toISODate, WEEKDAYS } from "@/lib/dates";
import { clientStatus, StatusBadge, statusDot, type ClientStatusKey } from "./client-status";

export type ApprovalFilter = "all" | "pending" | "approved" | "changes";
type Mode = "agenda" | "month";

const FILTERS: { id: ApprovalFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "pending", label: "Aguardando" },
  { id: "approved", label: "Aprovados" },
  { id: "changes", label: "Ajustes" },
];

function matches(task: PublicTask, filter: ApprovalFilter) {
  if (filter === "all") return true;
  return clientStatus(task) === (filter as ClientStatusKey);
}

// Cada tarefa aparece num dia só: a entrega, ou o início quando a entrega cai fora do mês.
function anchorDay(task: PublicTask, month: Date) {
  const due = task.dueDate ?? task.startDate!;
  if (isSameMonth(parseDate(due), month)) return due.slice(0, 10);
  const start = task.startDate ?? due;
  if (isSameMonth(parseDate(start), month)) return start.slice(0, 10);
  return toISODate(startOfMonth(month));
}

function dayLabel(iso: string) {
  return format(parseDate(iso), "d 'de' MMM", { locale: ptBR });
}

// Formato e tag costumam repetir o mesmo nome ("card" e "Card").
export function uniqueLabels(values: (string | null)[]) {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    const key = value?.trim().toLocaleLowerCase("pt-BR");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function dateRange(task: Pick<PublicTask, "startDate" | "dueDate">) {
  const start = task.startDate?.slice(0, 10);
  const due = task.dueDate?.slice(0, 10);
  if (start && due && start !== due) return `${dayLabel(start)} → ${dayLabel(due)}`;
  if (due) return `Entrega ${dayLabel(due)}`;
  if (start) return `Início ${dayLabel(start)}`;
  return "Sem data";
}

export function ClientCalendar({
  token,
  month,
  onMonthChange,
  tasks,
  undated,
  initialFilter = "all",
  onOpenTask,
}: {
  token: string;
  month: Date;
  onMonthChange: (month: Date) => void;
  tasks: PublicTask[];
  undated: PublicTask[];
  initialFilter?: ApprovalFilter;
  onOpenTask?: (task: PublicTask, list: PublicTask[]) => void;
}) {
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
      ? "month"
      : "agenda",
  );
  const [filter, setFilter] = useState<ApprovalFilter>(initialFilter);
  const [today] = useState(() => toISODate(new Date()));
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const visible = useMemo(() => tasks.filter((task) => matches(task, filter)), [tasks, filter]);
  const visibleUndated = useMemo(
    () => undated.filter((task) => matches(task, filter)),
    [undated, filter],
  );
  const byDay = useMemo(() => {
    const groups = new Map<string, PublicTask[]>();
    for (const task of visible) {
      const day = anchorDay(task, month);
      groups.set(day, [...(groups.get(day) ?? []), task]);
    }
    return new Map([...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  }, [visible, month]);
  const ordered = useMemo(
    () => [...[...byDay.values()].flat(), ...visibleUndated],
    [byDay, visibleUndated],
  );
  // Contagens do mês, como na aba Início; a seção "Sem data" mostra a própria contagem.
  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map((item) => [item.id, tasks.filter((task) => matches(task, item.id)).length]),
      ) as Record<ApprovalFilter, number>,
    [tasks],
  );

  const open = onOpenTask ? (task: PublicTask) => onOpenTask(task, ordered) : undefined;
  const selectedDay = pickedDay && pickedDay.startsWith(toISODate(month).slice(0, 7)) ? pickedDay : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-elevated p-1" role="group" aria-label="Visualização">
          <ModeButton active={mode === "agenda"} onClick={() => setMode("agenda")} icon={List}>
            Agenda
          </ModeButton>
          <ModeButton active={mode === "month"} onClick={() => setMode("month")} icon={CalendarRange}>
            Mês
          </ModeButton>
        </div>
        <button
          type="button"
          onClick={() => {
            onMonthChange(startOfMonth(new Date()));
            setPickedDay(today);
          }}
          className="min-h-10 rounded-full border border-line px-4 text-sm font-medium text-ink hover:bg-hover"
        >
          Hoje
        </button>
      </div>

      <div
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0"
        role="group"
        aria-label="Filtrar por aprovação"
      >
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={cn(
              "flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
              filter === item.id
                ? "border-ink bg-ink text-base"
                : "border-line text-muted hover:text-ink",
            )}
          >
            {item.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                filter === item.id ? "bg-base/20" : "bg-elevated",
              )}
            >
              {counts[item.id]}
            </span>
          </button>
        ))}
      </div>

      {mode === "month" ? (
        <MonthGrid
          month={month}
          today={today}
          byDay={byDay}
          selectedDay={selectedDay}
          onPickDay={setPickedDay}
          onOpen={open}
        />
      ) : null}

      {mode === "month" && selectedDay ? (
        <DayGroup
          day={selectedDay}
          today={today}
          tasks={byDay.get(selectedDay) ?? []}
          token={token}
          onOpen={open}
          emptyText="Nenhuma tarefa neste dia."
          className="md:hidden"
        />
      ) : null}

      {mode === "agenda" ? (
        byDay.size === 0 && visibleUndated.length === 0 ? (
          filter === "all" ? (
            <EmptyMonth month={month} />
          ) : (
            <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
              Nenhuma tarefa com esse status neste mês.
            </p>
          )
        ) : (
          <div className="flex flex-col gap-6">
            {[...byDay.entries()].map(([day, items]) => (
              <DayGroup key={day} day={day} today={today} tasks={items} token={token} onOpen={open} />
            ))}
          </div>
        )
      ) : null}

      {visibleUndated.length > 0 ? (
        <section aria-labelledby="sem-data" className="flex flex-col gap-3">
          <h2
            id="sem-data"
            className="text-xs font-semibold uppercase tracking-wider text-faint"
          >
            Sem data · {visibleUndated.length}
          </h2>
          <ul className="flex flex-col gap-3">
            {visibleUndated.map((task) => (
              <TaskItem key={task.id} task={task} token={token} onOpen={open} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof List;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
        active ? "bg-base text-ink shadow-sm" : "text-muted hover:text-ink",
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      {children}
    </button>
  );
}

function MonthGrid({
  month,
  today,
  byDay,
  selectedDay,
  onPickDay,
  onOpen,
}: {
  month: Date;
  today: string;
  byDay: Map<string, PublicTask[]>;
  selectedDay: string | null;
  onPickDay: (day: string) => void;
  onOpen?: (task: PublicTask) => void;
}) {
  const days = useMemo(() => monthGrid(month), [month]);
  return (
    <div className="overflow-hidden rounded-3xl border border-line">
      <div className="grid grid-cols-7 border-b border-line bg-elevated">
        {WEEKDAYS.map((label) => (
          <span key={label} className="py-2 text-center text-[11px] font-semibold uppercase text-faint">
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date) => {
          const iso = toISODate(date);
          const inMonth = isSameMonth(date, month);
          const items = inMonth ? (byDay.get(iso) ?? []) : [];
          const isToday = iso === today;
          const selected = iso === selectedDay;
          return (
            <div
              key={iso}
              className={cn(
                "relative min-h-16 border-b border-r border-line-subtle p-1 md:min-h-28 md:p-1.5 [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-elevated/40",
              )}
            >
              <button
                type="button"
                disabled={!inMonth}
                aria-label={`${format(date, "d 'de' MMMM", { locale: ptBR })}: ${items.length} ${items.length === 1 ? "tarefa" : "tarefas"}`}
                aria-pressed={selected}
                onClick={() => onPickDay(iso)}
                className={cn(
                  "flex w-full flex-col items-center gap-1 rounded-xl py-1 md:pointer-events-none md:items-start md:px-1",
                  selected && "bg-hover md:bg-transparent",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs tabular-nums",
                    !inMonth && "text-faint/50",
                    inMonth && !isToday && "text-ink",
                    isToday && "bg-ink font-semibold text-base",
                  )}
                >
                  {date.getDate()}
                </span>
                {items.length > 0 ? (
                  <span className="flex gap-0.5 md:hidden" aria-hidden>
                    {items.slice(0, 3).map((task) => (
                      <span key={task.id} className={cn("h-1.5 w-1.5 rounded-full", statusDot(clientStatus(task)))} />
                    ))}
                    {items.length > 3 ? (
                      <span className="text-[9px] leading-none text-faint">+{items.length - 3}</span>
                    ) : null}
                  </span>
                ) : null}
              </button>
              <div className="mt-1 hidden flex-col gap-1 md:flex">
                {items.slice(0, 3).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpen?.(task)}
                    className="flex items-center gap-1.5 truncate rounded-lg bg-elevated px-1.5 py-1 text-left text-[11px] text-ink hover:bg-hover"
                  >
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDot(clientStatus(task)))} />
                    <span className="truncate">{task.title}</span>
                  </button>
                ))}
                {items.length > 3 ? (
                  <span className="px-1.5 text-[11px] text-faint">
                    +{items.length - 3} {items.length - 3 === 1 ? "tarefa" : "tarefas"}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DayGroup = memo(function DayGroup({
  day,
  today,
  tasks,
  token,
  onOpen,
  emptyText,
  className,
}: {
  day: string;
  today: string;
  tasks: PublicTask[];
  token: string;
  onOpen?: (task: PublicTask) => void;
  emptyText?: string;
  className?: string;
}) {
  const date = parseDate(day);
  const isToday = day === today;
  return (
    <section className={cn("[content-visibility:auto] [contain-intrinsic-size:auto_200px]", className)}>
      <h2 className="sticky top-0 z-10 -mx-4 flex items-baseline gap-2 bg-base/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0">
        <span className="text-sm font-semibold text-ink">
          {format(date, "EEEE", { locale: ptBR }).replace(/^./, (char) => char.toUpperCase())}
        </span>
        <span className="text-sm text-muted">{format(date, "d 'de' MMMM", { locale: ptBR })}</span>
        {isToday ? (
          <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase text-base">
            Hoje
          </span>
        ) : null}
      </h2>
      {tasks.length === 0 ? (
        <p className="py-4 text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} token={token} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
});

export function TaskItem({
  task,
  token,
  onOpen,
}: {
  task: PublicTask;
  token: string;
  onOpen?: (task: PublicTask) => void;
}) {
  const image = task.attachments.find((file) => file.mime.startsWith("image/"));
  const labels = uniqueLabels([task.demandFormat, ...task.tags.map((tag) => tag.name)]);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen?.(task)}
        disabled={!onOpen}
        className="flex w-full gap-3 rounded-2xl border border-line bg-elevated p-3 text-left transition-colors hover:border-ink/30 disabled:cursor-default sm:p-4"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- arquivo servido pela API do link
          <img
            src={attachmentUrl(token, task.id, image.id, true)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-16 w-16 shrink-0 rounded-xl bg-hover object-cover sm:h-20 sm:w-20"
          />
        ) : null}
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="line-clamp-2 text-[15px] font-medium leading-snug text-ink">{task.title}</span>
          <span className="text-xs text-muted">{dateRange(task)}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge task={task} />
            {labels.slice(0, 3).map((label) => (
              <span
                key={label}
                className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted"
              >
                {label}
              </span>
            ))}
          </span>
        </span>
      </button>
    </li>
  );
}

export function EmptyMonth({ month }: { month: Date }) {
  return (
    <div className="rounded-3xl border border-dashed border-line px-6 py-14 text-center">
      <p className="text-base font-medium text-ink">Nada programado neste mês</p>
      <p className="mt-1 text-sm text-muted">
        Não há tarefas em {format(month, "MMMM", { locale: ptBR })}. Use as setas para ver outros meses.
      </p>
    </div>
  );
}
