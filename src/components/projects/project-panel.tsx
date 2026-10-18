"use client";

import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { parseDate, toISODate } from "@/lib/dates";
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/priority";
import type { Priority, Tag, Task, User } from "@/lib/types";

const OPEN = "#c6f54d";
const LATE = "#f87171";
const DOING = "#fbbf24";

type Period = "all" | "today" | "week" | "month" | "custom";
type Range = { start: string | null; end: string | null };

const PERIODS: { id: Period; label: string }[] = [
  { id: "all", label: "Tudo" },
  { id: "today", label: "Hoje" },
  { id: "week", label: "Esta semana" },
  { id: "month", label: "Este mês" },
  { id: "custom", label: "Datas" },
];

export function ProjectPanel({
  tasks,
  users,
  tags,
  sections,
  accent,
  onSelect,
}: {
  tasks: Task[];
  users: User[];
  tags: Tag[];
  sections: string[];
  accent: string;
  onSelect: (id: string) => void;
}) {
  const [period, setPeriod] = useState<Period>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range = useMemo(() => activeRange(period, from, to), [period, from, to]);
  const stats = useMemo(
    () => buildStats(tasks, users, tags, sections, range),
    [tasks, users, tags, sections, range],
  );

  function choosePeriod(next: Period) {
    setPeriod(next);
    if (next === "all" || next === "custom") {
      if (next === "all") {
        setFrom("");
        setTo("");
      }
      return;
    }
    const preset = activeRange(next, "", "");
    setFrom(preset.start ?? "");
    setTo(preset.end ?? "");
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-6">
      <div className="sticky top-0 z-10 -mx-6 mb-4 flex flex-wrap items-center gap-2 border-b border-line-subtle bg-base px-6 py-3">
        {PERIODS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => choosePeriod(item.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs",
              period === item.id ? "bg-elevated text-ink" : "text-faint hover:text-ink",
            )}
          >
            {item.label}
          </button>
        ))}
        <label className="ml-1 text-xs text-faint">
          De
          <input
            type="date"
            aria-label="Data inicial"
            value={from}
            onChange={(event) => {
              setPeriod("custom");
              setFrom(event.target.value);
            }}
            className="ml-2 h-8 rounded-full border border-line bg-elevated px-3 text-xs text-ink outline-none"
          />
        </label>
        <label className="text-xs text-faint">
          Até
          <input
            type="date"
            aria-label="Data final"
            value={to}
            onChange={(event) => {
              setPeriod("custom");
              setTo(event.target.value);
            }}
            className="ml-2 h-8 rounded-full border border-line bg-elevated px-3 text-xs text-ink outline-none"
          />
        </label>
        <span className="text-xs text-faint">
          {range.start || range.end
            ? `${stats.total.toLocaleString("pt-BR")} ${stats.total === 1 ? "tarefa" : "tarefas"} no período`
            : "Todo o projeto"}
        </span>
      </div>
      <Card className="mb-4 border-none">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-faint">Conclusão do projeto</span>
          <span className="text-ink">{stats.percent}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full"
            style={{ width: `${stats.percent}%`, backgroundColor: accent }}
          />
        </div>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Concluídas" value={stats.done} />
        <Stat label="Por concluir" value={stats.open} />
        <Stat label="Atrasadas" value={stats.overdue} />
        <Stat label="Total de tarefas" value={stats.total} />
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Nesta semana" value={stats.thisWeek} />
        <Stat label="Sem responsável" value={stats.unassigned} />
        <Stat label="Sem data" value={stats.undated} />
        <Stat
          label="Atraso médio"
          value={stats.avgLateDays}
          suffix={stats.avgLateDays === 1 ? "dia" : "dias"}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card className="border-none">
          <WidgetTitle>Por concluir, por seção</WidgetTitle>
          <BarChart items={stats.bySection} color={accent} />
        </Card>
        <Card className="border-none">
          <WidgetTitle>Por status</WidgetTitle>
          <Donut
            total={stats.total}
            segments={[
              { label: "Concluídas", value: stats.done, color: accent },
              { label: "Em andamento", value: stats.doing, color: DOING },
              { label: "A fazer", value: stats.todo, color: OPEN },
            ]}
          />
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card className="border-none">
          <WidgetTitle>Tarefas futuras, por responsável</WidgetTitle>
          <Lollipop items={stats.futureByAssignee} color={accent} />
        </Card>
        <Card className="border-none">
          <WidgetTitle>Conclusão ao longo do tempo</WidgetTitle>
          <TrendChart points={stats.trend} color={accent} />
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card className="border-none">
          <WidgetTitle>Em aberto, por prioridade</WidgetTitle>
          <Meters
            items={stats.byPriority.map((item) => ({
              label: item.label,
              value: item.value,
              color: PRIORITY_META[item.id].color,
            }))}
            empty="Nenhuma tarefa em aberto."
          />
        </Card>
        <Card className="border-none">
          <WidgetTitle>Tarefas por tag</WidgetTitle>
          <Meters items={stats.byTag} empty="Nenhuma tag neste projeto." />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-none">
          <WidgetTitle>Carga da equipe</WidgetTitle>
          <TeamLoad rows={stats.team} accent={accent} />
        </Card>
        <Card className="border-none">
          <WidgetTitle>Próximas entregas</WidgetTitle>
          {stats.upcoming.length === 0 ? (
            <Empty>Nenhuma tarefa em aberto.</Empty>
          ) : (
            <div className="space-y-1">
              {stats.upcoming.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onSelect(task.id)}
                  className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-hover"
                >
                  <span className="w-14 shrink-0 text-xs capitalize text-faint">
                    {task.when}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{task.title}</span>
                    <span className="mt-0.5 block text-xs text-faint">
                      {task.owner}
                      {task.late ? " · atrasada" : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <Card className="border-none">
      <p className="text-sm text-faint">{label}</p>
      <p className="mt-3 text-4xl font-medium tracking-tight text-ink">
        {value.toLocaleString("pt-BR")}
        {suffix ? (
          <span className="ml-2 text-base font-normal text-faint">{suffix}</span>
        ) : null}
      </p>
    </Card>
  );
}

function WidgetTitle({ children }: { children: string }) {
  return <p className="mb-5 text-sm text-faint">{children}</p>;
}

function Empty({ children }: { children: string }) {
  return <p className="text-sm text-faint">{children}</p>;
}

function BarChart({
  items,
  color,
}: {
  items: { label: string; value: number }[];
  color: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  if (items.length === 0) return <Empty>Nenhuma seção neste projeto.</Empty>;
  return (
    <div className="flex h-52 items-end gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
          <span className="mb-1 text-center text-xs text-ink">{item.value}</span>
          <div className="flex min-h-0 flex-1 items-end">
            <div
              className="w-full rounded-t-md"
              style={{
                height: `${Math.max((item.value / max) * 100, item.value > 0 ? 4 : 0)}%`,
                backgroundColor: color,
              }}
            />
          </div>
          <span className="mt-2 truncate text-center text-[10px] uppercase text-faint">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function Donut({
  total,
  segments,
}: {
  total: number;
  segments: { label: string; value: number; color: string }[];
}) {
  const visible = segments.filter((segment) => segment.value > 0);
  const radius = 58;
  const stroke = 18;
  const circ = 2 * Math.PI * radius;
  let cursor = 0;
  return (
    <div className="flex flex-wrap items-center gap-8">
      <svg
        viewBox="0 0 160 160"
        className="h-44 w-44 shrink-0"
        role="img"
        aria-label={`${total} tarefas no total`}
      >
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth={stroke}
        />
        {visible.map((segment) => {
          const length = total === 0 ? 0 : (segment.value / total) * circ;
          const dash = `${length} ${circ - length}`;
          const offset = cursor;
          cursor += length;
          return (
            <circle
              key={segment.label}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            />
          );
        })}
        <text
          x="80"
          y="86"
          textAnchor="middle"
          fill="var(--text-primary)"
          fontSize="28"
          fontWeight="500"
        >
          {total}
        </text>
      </svg>
      <div className="space-y-2">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span className="text-faint">{segment.label}</span>
            <span className="text-ink">{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Lollipop({
  items,
  color,
}: {
  items: { label: string; value: number }[];
  color: string;
}) {
  if (items.length === 0) return <Empty>Nenhuma tarefa com prazo a partir de hoje.</Empty>;
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="flex h-52 items-end gap-2">
      {items.map((item) => (
        <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
          <span className="text-xs text-ink">{item.value}</span>
          <div
            className="mt-1 w-px bg-ink"
            style={{ height: `${Math.max((item.value / max) * 120, 8)}px` }}
          />
          <span
            className="-mt-1.5 h-3 w-3 rounded-full border-2 bg-elevated"
            style={{ borderColor: color }}
          />
          <span className="mt-3 h-px w-4 bg-line" />
          <span className="mt-2 w-full truncate text-center text-[10px] text-faint">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function TrendChart({
  points,
  color,
}: {
  points: { label: string; total: number; done: number }[];
  color: string;
}) {
  if (points.length === 0) return <Empty>Ainda não há datas suficientes para a série.</Empty>;
  if (points.length === 1) {
    const point = points[0];
    return (
      <p className="text-sm text-faint">
        {point.label}: {point.total} previstas · {point.done} concluídas
      </p>
    );
  }
  const width = 320;
  const height = 160;
  const max = Math.max(...points.flatMap((point) => [point.total, point.done]), 1);
  const coords = (key: "total" | "done") =>
    points.map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - (point[key] / max) * (height - 8);
      return { x, y };
    });
  const done = coords("done");
  const total = coords("total");
  const labels = labelIndexes(points.length);
  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full"
        role="img"
        aria-label="Tarefas previstas e concluídas ao longo do tempo"
      >
        <path d={area(total, height)} fill="color-mix(in srgb, var(--text-primary) 16%, transparent)" />
        <path d={area(done, height)} fill={color} opacity="0.9" />
        <polyline
          points={poly(total)}
          fill="none"
          stroke="color-mix(in srgb, var(--text-primary) 55%, transparent)"
          strokeWidth="1.5"
        />
        <polyline points={poly(done)} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-faint">
        {labels.map((index) => (
          <span key={points[index].label}>{points[index].label}</span>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-faint">
        <span className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: "color-mix(in srgb, var(--text-primary) 45%, transparent)" }}
          />
          Previstas
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
          Concluídas
        </span>
      </div>
    </div>
  );
}

function Meters({
  items,
  empty = "Nada para mostrar.",
}: {
  items: { label: string; value: number; color: string }[];
  empty?: string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  const shown = items.filter((item) => item.value > 0);
  if (shown.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="space-y-3">
      {shown.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="truncate text-ink">{item.label}</span>
            <span className="text-faint">{item.value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamLoad({
  rows,
  accent,
}: {
  rows: {
    id: string;
    name: string;
    initials: string;
    avatar?: string | null;
    done: number;
    open: number;
    overdue: number;
  }[];
  accent: string;
}) {
  if (rows.length === 0) return <Empty>Nenhuma tarefa atribuída.</Empty>;
  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const total = row.done + row.open + row.overdue;
        return (
          <div key={row.id}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-ink">
                <Avatar initials={row.initials} src={row.avatar} name={row.name} size="sm" />
                <span className="truncate">{row.name}</span>
              </span>
              <span className="shrink-0 text-xs text-faint">
                {row.done} feitas · {row.open + row.overdue} abertas
                {row.overdue > 0 ? ` · ${row.overdue} atrasadas` : ""}
              </span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-line">
              <Bar width={total === 0 ? 0 : (row.done / total) * 100} color={accent} />
              <Bar width={total === 0 ? 0 : (row.open / total) * 100} color={OPEN} />
              <Bar width={total === 0 ? 0 : (row.overdue / total) * 100} color={LATE} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Bar({ width, color }: { width: number; color: string }) {
  if (width <= 0) return null;
  return <div style={{ width: `${width}%`, backgroundColor: color }} />;
}

function activeRange(period: Period, from: string, to: string): Range {
  const today = startOfDay(new Date());
  if (period === "all") return { start: null, end: null };
  if (period === "today") {
    const key = toISODate(today);
    return { start: key, end: key };
  }
  if (period === "week") {
    return {
      start: toISODate(startOfWeek(today, { weekStartsOn: 1 })),
      end: toISODate(startOfDay(endOfWeek(today, { weekStartsOn: 1 }))),
    };
  }
  if (period === "month") {
    return {
      start: toISODate(startOfMonth(today)),
      end: toISODate(startOfDay(endOfMonth(today))),
    };
  }
  const start = from || null;
  const end = to || null;
  if (start && end && start > end) return { start: end, end: start };
  return { start, end };
}

function inRange(dueDate: string | null, range: Range) {
  if (!range.start && !range.end) return true;
  if (!dueDate) return false;
  if (range.start && dueDate < range.start) return false;
  if (range.end && dueDate > range.end) return false;
  return true;
}

function buildStats(
  tasks: Task[],
  users: User[],
  tags: Tag[],
  sections: string[],
  range: Range,
) {
  const today = startOfDay(new Date());
  const todayKey = toISODate(today);
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = startOfDay(endOfWeek(today, { weekStartsOn: 1 }));
  const roots = tasks.filter((task) => !task.parentId && inRange(task.dueDate, range));
  const doneTasks = roots.filter((task) => task.status === "done");
  const openTasks = roots.filter((task) => task.status !== "done");
  const overdueTasks = openTasks.filter((task) => isLate(task, todayKey));
  const doing = openTasks.filter((task) => task.status === "doing").length;
  const lateDays = overdueTasks.map((task) =>
    differenceInCalendarDays(today, parseDate(task.dueDate as string)),
  );
  const avgLateDays =
    lateDays.length === 0
      ? 0
      : Math.round(lateDays.reduce((sum, days) => sum + days, 0) / lateDays.length);

  const sectionNames = [
    ...sections,
    ...roots
      .map((task) => task.section)
      .filter((name) => name && !sections.includes(name)),
  ];
  const bySection = sectionNames.map((label) => ({
    label,
    value: openTasks.filter((task) => (task.section || "Geral") === label).length,
  }));

  const byPriority = PRIORITY_ORDER.map((id) => ({
    id,
    label: PRIORITY_META[id].label,
    value: openTasks.filter((task) => task.priority === id).length,
  }));

  const tagCounts = new Map<string, number>();
  for (const task of roots) {
    for (const tagId of task.tagIds) {
      tagCounts.set(tagId, (tagCounts.get(tagId) ?? 0) + 1);
    }
  }
  const byTag = [...tagCounts.entries()]
    .map(([id, value]) => {
      const tag = tags.find((item) => item.id === id);
      return { label: tag?.name ?? "Tag", value, color: tag?.color ?? "#a3a3a3" };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const future = openTasks.filter(
    (task) => task.dueDate && task.dueDate >= todayKey,
  );
  const futureGroups = groupBy(future, (task) => task.assigneeId ?? "none");
  const futureByAssignee = [...futureGroups.entries()]
    .map(([id, items]) => ({
      label: personName(users, id),
      value: items.length,
    }))
    .sort((a, b) => b.value - a.value);

  const assigneeIds = new Set<string>();
  for (const task of roots) {
    if (task.assigneeId) assigneeIds.add(task.assigneeId);
  }
  const team = [...assigneeIds].map((id) => {
    const user = users.find((item) => item.id === id);
    const assigned = roots.filter((task) => task.assigneeId === id);
    const open = assigned.filter((task) => task.status !== "done" && !isLate(task, todayKey));
    const late = assigned.filter((task) => isLate(task, todayKey));
    return {
      id,
      name: user?.name ?? "Sem nome",
      initials: user?.initials ?? "?",
      avatar: user?.avatar,
      done: assigned.filter((task) => task.status === "done").length,
      open: open.length,
      overdue: late.length,
    };
  });
  const unassignedTasks = roots.filter((task) => !task.assigneeId);
  if (unassignedTasks.length > 0) {
    team.push({
      id: "none",
      name: "Sem responsável",
      initials: "—",
      avatar: null,
      done: unassignedTasks.filter((task) => task.status === "done").length,
      open: unassignedTasks.filter((task) => task.status !== "done" && !isLate(task, todayKey))
        .length,
      overdue: unassignedTasks.filter((task) => isLate(task, todayKey)).length,
    });
  }
  team.sort((a, b) => b.open + b.overdue - (a.open + a.overdue));

  const upcoming = [...openTasks]
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return a.title.localeCompare(b.title, "pt-BR");
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    })
    .slice(0, 6)
    .map((task) => ({
      id: task.id,
      title: task.title,
      when: task.dueDate ? format(parseDate(task.dueDate), "d MMM", { locale: ptBR }) : "—",
      owner: personName(users, task.assigneeId ?? "none"),
      late: isLate(task, todayKey),
    }));

  return {
    total: roots.length,
    done: doneTasks.length,
    open: openTasks.length,
    overdue: overdueTasks.length,
    doing,
    todo: openTasks.length - doing,
    percent: roots.length === 0 ? 0 : Math.round((doneTasks.length / roots.length) * 100),
    thisWeek: openTasks.filter((task) => inWeek(task, weekStart, weekEnd)).length,
    unassigned: openTasks.filter((task) => !task.assigneeId).length,
    undated: openTasks.filter((task) => !task.dueDate).length,
    avgLateDays,
    bySection,
    byPriority: byPriority as { id: Priority; label: string; value: number }[],
    byTag,
    futureByAssignee,
    trend: buildTrend(roots, today, range),
    team,
    upcoming,
  };
}

function isLate(task: Task, todayKey: string) {
  return Boolean(task.dueDate && task.status !== "done" && task.dueDate < todayKey);
}

function inWeek(task: Task, start: Date, end: Date) {
  if (!task.dueDate) return false;
  const due = startOfDay(parseDate(task.dueDate));
  return due >= start && due <= end;
}

function personName(users: User[], id: string) {
  if (id === "none") return "Sem responsável";
  const user = users.find((item) => item.id === id);
  return user?.name.split(" ")[0] ?? "Sem nome";
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const id = key(item);
    const list = map.get(id) ?? [];
    list.push(item);
    map.set(id, list);
  }
  return map;
}

function buildTrend(tasks: Task[], today: Date, range: Range) {
  const dates = tasks.flatMap((task) =>
    [task.dueDate, task.completedAt, task.createdAt].filter((value): value is string =>
      Boolean(value),
    ),
  );
  if (dates.length === 0 && !range.start && !range.end) return [];
  const sorted = [...dates].sort();
  let start = range.start
    ? startOfDay(parseDate(range.start))
    : startOfDay(parseDate((sorted[0] ?? toISODate(today)).slice(0, 10)));
  let end = range.end
    ? startOfDay(parseDate(range.end))
    : startOfDay(parseDate((sorted[sorted.length - 1] ?? toISODate(today)).slice(0, 10)));
  if (!range.start && !range.end && end < today) end = today;
  if (!range.start && !range.end && differenceInCalendarDays(end, start) > 45) {
    start = addDays(end, -45);
  }
  if (end < start) end = start;

  const span = differenceInCalendarDays(end, start);
  const step = span > 21 ? 7 : 1;
  const points: { label: string; total: number; done: number }[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, step)) {
    const key = toISODate(cursor);
    points.push({
      label: format(cursor, "dd/MM"),
      total: tasks.filter((task) => task.dueDate && task.dueDate <= key).length,
      done: tasks.filter((task) => doneOnOrBefore(task, key)).length,
    });
  }
  const endKey = toISODate(end);
  const last = points[points.length - 1];
  if (!last || last.label !== format(end, "dd/MM")) {
    points.push({
      label: format(end, "dd/MM"),
      total: tasks.filter((task) => task.dueDate && task.dueDate <= endKey).length,
      done: tasks.filter((task) => doneOnOrBefore(task, endKey)).length,
    });
  }
  return points;
}

function doneOnOrBefore(task: Task, key: string) {
  if (task.status !== "done") return false;
  const stamp = (task.completedAt ?? task.dueDate ?? task.createdAt).slice(0, 10);
  return stamp <= key;
}

function poly(points: { x: number; y: number }[]) {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function area(points: { x: number; y: number }[], height: number) {
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x.toFixed(1)} ${height} L ${first.x.toFixed(1)} ${height} Z`;
}

function labelIndexes(length: number) {
  if (length <= 4) return pointsRange(length);
  return [0, Math.floor(length / 2), length - 1];
}

function pointsRange(length: number) {
  return Array.from({ length }, (_, index) => index);
}
