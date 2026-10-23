"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Link2,
  Paperclip,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreateDemandDialog, FORMAT_OPTIONS } from "@/components/demands/create-demand-dialog";
import { ShareDemandLinkDialog } from "@/components/demands/share-demand-link-dialog";
import { TaskApprovalBadge, TaskFormatBadge } from "@/components/tasks/task-approval-badge";
import { TaskViewer } from "@/components/tasks/task-panel";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { usePrefs } from "@/lib/prefs";
import type { DemandFormat, Task } from "@/lib/types";
import { useAccess, useWorkspace } from "@/lib/workspace";

type TabMode = "demandas" | "aprovacoes";

const TABS: { id: TabMode; label: string }[] = [
  { id: "demandas", label: "Todas" },
  { id: "aprovacoes", label: "Aprovações" },
];

function demandTasksFrom(
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

export default function DemandsPage() {
  const [tab, setTab] = useState<TabMode>("demandas");
  const [formatFilter, setFormatFilter] = useState<DemandFormat | "all">("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [demandDialogOpen, setDemandDialogOpen] = useState(false);
  const [shareLinkDialogOpen, setShareLinkDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allTasks = useWorkspace((state) => state.tasks);
  const projects = useWorkspace((state) => state.projects);
  const users = useWorkspace((state) => state.users);
  const tags = useWorkspace((state) => state.tags);
  const taskView = usePrefs((state) => state.taskView);
  const setTaskView = usePrefs((state) => state.setTaskView);
  const { isClient } = useAccess();

  const demandTasks = useMemo(
    () => demandTasksFrom(allTasks, tags),
    [allTasks, tags],
  );

  const countPending = useMemo(
    () => demandTasks.filter((t) => t.approvalStatus === "pending").length,
    [demandTasks],
  );
  const countChanges = useMemo(
    () => demandTasks.filter((t) => t.approvalStatus === "changes_requested").length,
    [demandTasks],
  );
  const countApproved = useMemo(
    () => demandTasks.filter((t) => t.approvalStatus === "approved").length,
    [demandTasks],
  );

  const filtered = useMemo(() => {
    return demandTasks.filter((t) => {
      if (projectFilter !== "all" && t.projectId !== projectFilter) return false;
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
  }, [demandTasks, projectFilter, statusFilter, formatFilter, search, tags]);

  const selected = useMemo(
    () => allTasks.find((t) => t.id === selectedId) ?? null,
    [allTasks, selectedId],
  );

  function openApprovals(status: string) {
    setTab("aprovacoes");
    setStatusFilter(status);
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          {/* Header */}
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-medium tracking-tight text-ink">
                Demandas
              </h1>
              {isClient ? (
                <p className="mt-1 max-w-xl text-sm text-faint">
                  Solicite conteúdo e aprove entregas da equipe — cards, carrosséis, vídeos e reels.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareLinkDialogOpen(true)}
                className="gap-1.5"
              >
                <Link2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                Link do agente
              </Button>
              <Button size="sm" onClick={() => setDemandDialogOpen(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                Solicitar demanda
              </Button>
            </div>
          </div>

          {/* Agent strip */}
          <button
            type="button"
            onClick={() => setShareLinkDialogOpen(true)}
            className="mb-6 flex w-full items-center justify-between gap-3 rounded-[20px] bg-elevated px-5 py-4 text-left transition-colors hover:bg-hover"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-base">
                <Sparkles className="h-4 w-4 text-muted" strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-ink">Agente de demandas</p>
                <p className="mt-0.5 truncate text-xs text-faint">
                  Envie um link verificado para o cliente conversar e abrir solicitações.
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-faint" strokeWidth={1.5} />
          </button>

          {/* Metrics */}
          <Card className="mb-6 border-none">
            <p className="mb-5 text-sm text-faint">Resumo</p>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <MetricStat label="Total" value={String(demandTasks.length)} />
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

          {/* Tabs + project filter */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1">
              {TABS.map((item) => {
                const active = tab === item.id;
                const count =
                  item.id === "demandas" ? filtered.length : countPending;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTab(item.id);
                      if (item.id === "demandas") setStatusFilter("all");
                    }}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-elevated text-ink"
                        : "text-muted hover:bg-hover hover:text-ink",
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
            {projects.length > 1 ? (
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="h-9 rounded-full border border-line bg-elevated px-3.5 text-sm text-ink outline-none transition-colors hover:bg-hover"
              >
                <option value="all">Todos os projetos</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
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
              onSelect={setSelectedId}
              onCreate={() => setDemandDialogOpen(true)}
            />
          ) : (
            <ApprovalsBoard
              tasks={demandTasks}
              statusFilter={statusFilter}
              onSelect={setSelectedId}
              countPending={countPending}
              countChanges={countChanges}
              countApproved={countApproved}
            />
          )}

          <p className="mt-10 text-center text-xs text-faint">
            <Link href="/agente" className="hover:text-ink transition-colors">
              Abrir Agente IA
            </Link>
            <span className="mx-2">·</span>
            <span>mesmo assistente do Overview</span>
          </p>
        </div>
      </div>

      {selected ? (
        <TaskViewer
          task={selected}
          users={users}
          tags={tags}
          projects={projects}
          mode={taskView}
          onModeChange={setTaskView}
          onClose={() => setSelectedId(null)}
          subtasks={allTasks.filter((task) => task.parentId === selected.id)}
          onOpenSubtask={(id) => setSelectedId(id)}
        />
      ) : null}

      <CreateDemandDialog
        open={demandDialogOpen}
        onClose={() => setDemandDialogOpen(false)}
        onDemandCreated={(task) => setSelectedId(task.id)}
      />

      <ShareDemandLinkDialog
        open={shareLinkDialogOpen}
        onClose={() => setShareLinkDialogOpen(false)}
        defaultProjectId={projectFilter !== "all" ? projectFilter : undefined}
      />
    </div>
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
      <button
        type="button"
        onClick={onClick}
        className="text-left transition-opacity hover:opacity-80"
      >
        {inner}
      </button>
    );
  }

  return <div>{inner}</div>;
}

function DemandsList({
  filtered,
  formatFilter,
  setFormatFilter,
  search,
  setSearch,
  projects,
  users,
  onSelect,
  onCreate,
}: {
  filtered: Task[];
  formatFilter: DemandFormat | "all";
  setFormatFilter: (v: DemandFormat | "all") => void;
  search: string;
  setSearch: (v: string) => void;
  projects: { id: string; name: string; color: string }[];
  users: { id: string; name: string }[];
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterPill active={formatFilter === "all"} onClick={() => setFormatFilter("all")}>
            Todos
          </FilterPill>
          {FORMAT_OPTIONS.map((f) => {
            const Icon = f.icon;
            return (
              <FilterPill
                key={f.id}
                active={formatFilter === f.id}
                onClick={() => setFormatFilter(f.id)}
              >
                <Icon className="h-3 w-3" strokeWidth={1.5} />
                {f.label}
              </FilterPill>
            );
          })}
        </div>
        <div className="relative w-full sm:w-56">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
            strokeWidth={1.5}
          />
          <input
            type="search"
            placeholder="Buscar por título…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-full border border-line bg-elevated pl-9 pr-3 text-sm text-ink placeholder:text-faint outline-none transition-colors focus:border-ink/30"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-none py-16 text-center">
          <p className="text-sm text-ink">Nenhuma solicitação encontrada</p>
          <p className="mt-1 text-sm text-faint">
            Crie uma demanda ou compartilhe o link do agente com o cliente.
          </p>
          <Button size="sm" onClick={onCreate} className="mt-5 gap-1.5">
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            Solicitar demanda
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((task) => (
            <DemandCard
              key={task.id}
              task={task}
              project={projects.find((p) => p.id === task.projectId)}
              assignee={users.find((u) => u.id === task.assigneeId)}
              onSelect={() => onSelect(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-line bg-elevated text-ink"
          : "border-transparent text-muted hover:border-line hover:bg-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function DemandCard({
  task,
  project,
  assignee,
  onSelect,
}: {
  task: Task;
  project?: { name: string; color: string };
  assignee?: { name: string };
  onSelect: () => void;
}) {
  const refCount =
    task.referenceUrls?.split(/\r?\n/).filter((l) => Boolean(l.trim())).length ?? 0;
  const attachmentsCount = task.attachments?.length ?? 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex flex-col rounded-[20px] bg-elevated p-5 text-left transition-colors hover:bg-hover"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <TaskFormatBadge format={task.demandFormat} />
          <TaskApprovalBadge status={task.approvalStatus} />
        </div>
        {task.dueDate ? (
          <span className="shrink-0 text-xs text-faint">{formatDay(task.dueDate)}</span>
        ) : null}
      </div>
      <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink">{task.title}</h3>
      {task.description ? (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted">{task.description}</p>
      ) : null}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line-subtle pt-3 text-xs text-faint">
        <div className="flex min-w-0 items-center gap-2">
          {project ? (
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              <span className="truncate">{project.name}</span>
            </span>
          ) : null}
          {refCount > 0 ? (
            <span className="flex shrink-0 items-center gap-0.5">
              <Link2 className="h-3 w-3" strokeWidth={1.5} />
              {refCount}
            </span>
          ) : null}
          {attachmentsCount > 0 ? (
            <span className="flex shrink-0 items-center gap-0.5">
              <Paperclip className="h-3 w-3" strokeWidth={1.5} />
              {attachmentsCount}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 truncate">
          {assignee ? assignee.name.split(" ")[0] : "Equipe"}
        </span>
      </div>
    </button>
  );
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
                  className="w-full rounded-2xl border border-line-subtle bg-base p-3 text-left transition-colors hover:bg-hover"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <TaskFormatBadge format={task.demandFormat} />
                    {task.dueDate ? (
                      <span className="text-[10px] text-faint">{formatDay(task.dueDate)}</span>
                    ) : null}
                  </div>
                  <p className="text-xs font-medium text-ink">{task.title}</p>
                  {task.approvalFeedback && col.id === "changes_requested" ? (
                    <p className="mt-2 line-clamp-2 text-[11px] text-muted">
                      {task.approvalFeedback}
                    </p>
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
