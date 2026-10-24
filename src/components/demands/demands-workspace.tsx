"use client";

import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DemandsList } from "@/components/demands/demand-list";
import { DemandsProjectFilter } from "@/components/demands/demands-project-filter";
import { TaskApprovalBadge, TaskFormatBadge } from "@/components/tasks/task-approval-badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import type { DemandFormat, Task } from "@/lib/types";

type TabMode = "demandas" | "aprovacoes";

const TABS: { id: TabMode; label: string }[] = [
  { id: "demandas", label: "Todas" },
  { id: "aprovacoes", label: "Aprovações" },
];

export function demandTasksFrom(
  allTasks: Task[],
  tags: { id: string; name: string }[],
) {
  return allTasks.filter((t) => {
    if (t.id.startsWith("hist-")) return false;
    const isDem =
      t.isDemand ||
      Boolean(t.demandFormat) ||
      (t.approvalStatus && t.approvalStatus !== "none") ||
      t.section.toLowerCase().includes("demanda") ||
      t.tagIds.some((tagId) => {
        const name = tags.find((item) => item.id === tagId)?.name.toLowerCase() ?? "";
        return ["card", "carrossel", "reels", "vídeo longo", "video longo"].includes(name);
      });
    return isDem;
  });
}

export function DemandsWorkspace({
  tasks,
  projects,
  users,
  tags,
  onSelect,
  onCreate,
  lockedProjectId,
  initialTab = "demandas",
  onProjectFilterChange,
}: {
  tasks: Task[];
  projects: { id: string; name: string; color: string }[];
  users: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  onSelect: (id: string) => void;
  onCreate: () => void;
  lockedProjectId?: string;
  initialTab?: TabMode;
  onProjectFilterChange?: (projectId: string) => void;
}) {
  const [tab, setTab] = useState<TabMode>(initialTab);
  const [formatFilter, setFormatFilter] = useState<DemandFormat | "all">("all");
  const [projectFilter, setProjectFilter] = useState<string>(lockedProjectId ?? "all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const demandTasks = useMemo(() => demandTasksFrom(tasks, tags), [tasks, tags]);

  const scoped = useMemo(() => {
    if (projectFilter === "all") return demandTasks;
    return demandTasks.filter((task) => task.projectId === projectFilter);
  }, [demandTasks, projectFilter]);

  const countPending = useMemo(
    () => scoped.filter((t) => t.approvalStatus === "pending").length,
    [scoped],
  );
  const countChanges = useMemo(
    () => scoped.filter((t) => t.approvalStatus === "changes_requested").length,
    [scoped],
  );
  const countApproved = useMemo(
    () => scoped.filter((t) => t.approvalStatus === "approved").length,
    [scoped],
  );

  const filtered = useMemo(() => {
    return scoped.filter((t) => {
      if (statusFilter !== "all") {
        if (statusFilter === "pending" && t.approvalStatus !== "pending") return false;
        if (statusFilter === "approved" && t.approvalStatus !== "approved") return false;
        if (statusFilter === "changes_requested" && t.approvalStatus !== "changes_requested")
          return false;
      }
      if (formatFilter !== "all") {
        const matchesFormat =
          t.demandFormat === formatFilter ||
          t.tagIds.some((tagId) => {
            const name = tags.find((item) => item.id === tagId)?.name.toLowerCase() ?? "";
            if (formatFilter === "card") return name === "card";
            if (formatFilter === "carrossel") return name === "carrossel";
            if (formatFilter === "reels") return name === "reels";
            if (formatFilter === "video_longo")
              return name.includes("video") || name.includes("vídeo");
            return false;
          });
        if (!matchesFormat) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = t.description?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc) return false;
      }
      return true;
    });
  }, [scoped, statusFilter, formatFilter, search, tags]);

  function openApprovals(status: string) {
    setTab("aprovacoes");
    setStatusFilter(status);
  }

  function changeProject(value: string) {
    setProjectFilter(value);
    onProjectFilterChange?.(value);
  }

  return (
    <>
      <Card className="mb-6 border-none">
        <p className="mb-5 text-sm text-faint">Resumo</p>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <MetricStat label="Total" value={String(scoped.length)} />
          <MetricStat
            label="Em aprovação"
            value={String(countPending)}
            accent="amber"
            onClick={() => openApprovals("pending")}
          />
          <MetricStat
            label="Ajustes"
            value={String(countChanges)}
            accent="red"
            onClick={() => openApprovals("changes_requested")}
          />
          <MetricStat
            label="Aprovadas"
            value={String(countApproved)}
            accent="emerald"
            onClick={() => openApprovals("approved")}
          />
        </div>
      </Card>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {TABS.map((item) => {
            const active = tab === item.id;
            const count = item.id === "demandas" ? filtered.length : countPending;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  if (item.id === "demandas") setStatusFilter("all");
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors",
                  active ? "bg-elevated text-ink" : "text-muted hover:bg-hover hover:text-ink",
                )}
              >
                {item.label}
                <span className="text-xs text-faint">{count}</span>
                {item.id === "aprovacoes" && countPending > 0 ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                ) : null}
              </button>
            );
          })}
        </div>
        {!lockedProjectId && projects.length > 1 ? (
          <DemandsProjectFilter
            value={projectFilter}
            projects={projects}
            onChange={changeProject}
          />
        ) : null}
      </div>

      {tab === "demandas" ? (
        <DemandsList
          filtered={filtered}
          formatFilter={formatFilter}
          setFormatFilter={setFormatFilter}
          search={search}
          setSearch={setSearch}
          projects={projects}
          users={users}
          onSelect={onSelect}
          onCreate={onCreate}
        />
      ) : (
        <ApprovalsBoard
          tasks={scoped}
          statusFilter={statusFilter}
          onSelect={onSelect}
          countPending={countPending}
          countChanges={countChanges}
          countApproved={countApproved}
        />
      )}

      <p className="mt-10 text-center text-xs text-faint">
        <Link href="/agente" className="transition-colors hover:text-ink">
          Abrir Agente IA
        </Link>
        <span className="mx-2">·</span>
        <span>mesmo assistente do Overview</span>
      </p>
    </>
  );
}

function MetricStat({
  label,
  value,
  accent,
  onClick,
}: {
  label: string;
  value: string;
  accent?: "amber" | "red" | "emerald";
  onClick?: () => void;
}) {
  const dot =
    accent === "amber"
      ? "bg-amber-400"
      : accent === "red"
        ? "bg-red-400"
        : accent === "emerald"
          ? "bg-emerald-400"
          : null;

  const inner = (
    <>
      <div className="flex items-center gap-2">
        {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", dot)} /> : null}
        <p className="text-xs text-faint">{label}</p>
      </div>
      <p className="mt-1 text-3xl font-medium tracking-tight text-ink">{value}</p>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="cursor-pointer text-left transition-opacity hover:opacity-80">
        {inner}
      </button>
    );
  }

  return <div>{inner}</div>;
}

function ApprovalsBoard({
  tasks,
  statusFilter,
  onSelect,
  countPending,
  countChanges,
  countApproved,
}: {
  tasks: Task[];
  statusFilter: string;
  onSelect: (id: string) => void;
  countPending: number;
  countChanges: number;
  countApproved: number;
}) {
  const columns = [
    {
      id: "pending",
      title: "Aguardando",
      icon: Clock,
      count: countPending,
      filter: (t: Task) => t.approvalStatus === "pending",
    },
    {
      id: "changes_requested",
      title: "Ajustes",
      icon: AlertCircle,
      count: countChanges,
      filter: (t: Task) => t.approvalStatus === "changes_requested",
    },
    {
      id: "approved",
      title: "Aprovadas",
      icon: CheckCircle2,
      count: countApproved,
      filter: (t: Task) => t.approvalStatus === "approved",
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {columns.map((col) => {
        const Icon = col.icon;
        const items = tasks.filter(col.filter);
        const dimmed = statusFilter !== "all" && statusFilter !== col.id;
        return (
          <div
            key={col.id}
            className={cn(
              "flex min-h-[320px] flex-col rounded-[20px] bg-elevated p-4 transition-opacity",
              dimmed && "opacity-50",
            )}
          >
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-line-subtle pb-3">
              <div className="flex items-center gap-2 text-sm text-ink">
                <Icon className="h-4 w-4 text-faint" strokeWidth={1.5} />
                <span className="font-medium">{col.title}</span>
              </div>
              <span className="text-xs text-faint">{col.count}</span>
            </div>
            <div className="space-y-2">
              {items.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onSelect(task.id)}
                  className="w-full cursor-pointer rounded-2xl border border-line-subtle bg-base p-3 text-left transition-colors hover:bg-hover"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <TaskFormatBadge format={task.demandFormat} />
                    {task.dueDate ? (
                      <span className="text-[10px] text-faint">{formatDay(task.dueDate)}</span>
                    ) : null}
                  </div>
                  <p className="text-xs font-medium text-ink">{task.title}</p>
                  {task.approvalFeedback && col.id === "changes_requested" ? (
                    <p className="mt-2 line-clamp-2 text-[11px] text-muted">{task.approvalFeedback}</p>
                  ) : null}
                </button>
              ))}
              {items.length === 0 ? (
                <p className="py-12 text-center text-xs text-faint">Nada aqui</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
