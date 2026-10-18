"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMemo, useState } from "react";
import { DueStatusCard, InsightChartCard } from "@/components/insights/dashboard-charts";
import { cn } from "@/lib/cn";
import { parseDate } from "@/lib/dates";
import {
  buildWorkspaceInsights,
  rangeForPeriod,
  type DateRange,
  type InsightPeriod,
} from "@/lib/workspace-insights";
import { useWorkspace } from "@/lib/workspace";

const PERIODS: { id: InsightPeriod; label: string }[] = [
  { id: "all", label: "Tudo" },
  { id: "today", label: "Hoje" },
  { id: "week", label: "Esta semana" },
  { id: "month", label: "Este mês" },
  { id: "30d", label: "30 dias" },
  { id: "quarter", label: "Trimestre" },
  { id: "year", label: "Ano" },
  { id: "custom", label: "Datas" },
];

export default function InsightsPage() {
  const workspace = useWorkspace((state) => state.workspace);
  const projects = useWorkspace((state) => state.projects);
  const tasks = useWorkspace((state) => state.tasks);
  const users = useWorkspace((state) => state.users);
  const [period, setPeriod] = useState<InsightPeriod>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range = useMemo(() => rangeForPeriod(period, from, to), [period, from, to]);
  const stats = useMemo(
    () => buildWorkspaceInsights(tasks, projects, users, range),
    [tasks, projects, users, range],
  );
  const workspaceName = workspace?.name ?? "espaço de trabalho";
  const caption = filterCaption(range, workspaceName);

  function choosePeriod(next: InsightPeriod) {
    setPeriod(next);
    if (next === "all") {
      setFrom("");
      setTo("");
      return;
    }
    if (next === "custom") return;
    const preset = rangeForPeriod(next, "", "");
    setFrom(preset.start ?? "");
    setTo(preset.end ?? "");
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-medium tracking-tight text-ink">Insights</h1>
        <p className="mt-2 text-sm text-faint">
          Tarefas de todos os projetos em {workspaceName}.
        </p>
      </div>

      <div className="sticky top-0 z-10 -mx-6 mb-6 border-b border-line-subtle bg-base px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => choosePeriod(item.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                period === item.id ? "bg-ink text-base" : "text-faint hover:bg-hover hover:text-ink",
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
        </div>
        <p className="mt-2 text-xs text-faint">
          {stats.total.toLocaleString("pt-BR")} {stats.total === 1 ? "tarefa" : "tarefas"}
          {" · "}
          {formatRange(range)}. O período considera criação, prazo ou conclusão.
        </p>
      </div>

      <div className="mb-4">
        <InsightChartCard
          title="Total de tarefas (por projeto)"
          caption={caption}
          items={stats.byProject}
          preview={16}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InsightChartCard
          title="Total de tarefas por concluir (por projeto)"
          caption={caption}
          items={stats.openByProject}
        />
        <InsightChartCard
          title="Total de tarefas concluídas (por responsável)"
          caption={caption}
          items={stats.doneByAssignee}
          avatars
        />
        <InsightChartCard
          title="Total de tarefas por concluir (por responsável)"
          caption={caption}
          items={stats.openByAssignee}
          avatars
        />
        <DueStatusCard
          title="Total de tarefas (por status do prazo)"
          caption={caption}
          slices={stats.due}
        />
      </div>
    </div>
  );
}

function filterCaption(range: DateRange, workspaceName: string) {
  const filters = range.start || range.end ? 2 : 1;
  const label = filters === 1 ? "1 filtro" : `${filters} filtros`;
  return `${label} · Tarefas em ${workspaceName}`;
}

function formatRange(range: DateRange) {
  if (!range.start && !range.end) return "todo o período";
  const fmt = (value: string) => format(parseDate(value), "d MMM yyyy", { locale: ptBR });
  if (range.start && range.end) {
    if (range.start === range.end) return fmt(range.start);
    return `${fmt(range.start)} – ${fmt(range.end)}`;
  }
  if (range.start) return `a partir de ${fmt(range.start)}`;
  return `até ${fmt(range.end as string)}`;
}
