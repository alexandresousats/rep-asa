"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Film,
  Layers,
  Link2,
  Paperclip,
  Plus,
  Search,
  Smartphone,
  Sparkles,
  Square,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
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
  const { isClient, isAdmin, canWrite } = useAccess();

  // All demand tasks (either isDemand, has demandFormat, has format tags, or in demand sections)
  const demandTasks = useMemo(() => {
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
  }, [allTasks, tags]);

  // Counts
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

  // Filtered list
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

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-base">
        {/* Top Header */}
        <div className="border-b border-line-subtle px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-sm">
                  <Layers className="h-3.5 w-3.5" />
                </span>
                <h1 className="text-xl font-medium tracking-tight text-ink">
                  Central de Demandas & Aprovações
                </h1>
              </div>
              <p className="mt-1 text-xs text-faint">
                {isClient
                  ? "Faça suas solicitações de conteúdo (cards, carrosséis, vídeos longos e reels) e aprove os materiais produzidos pela equipe."
                  : "Acompanhe todas as demandas recebidas dos clientes e gerencie o fluxo de aprovação."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="outline"
                onClick={() => setShareLinkDialogOpen(true)}
                className="gap-2 border-line bg-elevated/80 text-ink hover:bg-hover hover:border-line-subtle shadow-xs"
              >
                <Link2 className="h-4 w-4 text-sky-400" />
                <span>Link Verificado do Agente</span>
              </Button>

              <Button
                onClick={() => setDemandDialogOpen(true)}
                className="gap-2 bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-md hover:opacity-95"
              >
                <Plus className="h-4 w-4" />
                <span>Solicitar Demanda</span>
              </Button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-line bg-elevated/70 p-3.5">
              <span className="text-[11px] font-medium text-faint">Total de Demandas</span>
              <p className="mt-1 text-2xl font-semibold text-ink">{demandTasks.length}</p>
            </div>

            <div
              onClick={() => {
                setTab("aprovacoes");
                setStatusFilter("pending");
              }}
              className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 cursor-pointer transition-colors hover:border-amber-500/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-amber-300">Em Aprovação</span>
                <Clock className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <p className="mt-1 text-2xl font-semibold text-amber-200">{countPending}</p>
            </div>

            <div
              onClick={() => {
                setTab("aprovacoes");
                setStatusFilter("changes_requested");
              }}
              className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3.5 cursor-pointer transition-colors hover:border-red-500/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-red-300">Ajustes Solicitados</span>
                <AlertCircle className="h-3.5 w-3.5 text-red-400" />
              </div>
              <p className="mt-1 text-2xl font-semibold text-red-200">{countChanges}</p>
            </div>

            <div
              onClick={() => {
                setTab("aprovacoes");
                setStatusFilter("approved");
              }}
              className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 cursor-pointer transition-colors hover:border-emerald-500/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-emerald-300">Aprovadas</span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <p className="mt-1 text-2xl font-semibold text-emerald-200">{countApproved}</p>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="mt-5 flex items-center justify-between border-t border-line-subtle pt-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTab("demandas")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                  tab === "demandas"
                    ? "bg-elevated text-ink shadow-sm"
                    : "text-faint hover:text-ink",
                )}
              >
                Todas as Demandas ({filtered.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("aprovacoes")}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                  tab === "aprovacoes"
                    ? "bg-elevated text-ink shadow-sm"
                    : "text-faint hover:text-ink",
                )}
              >
                <span>Painel de Aprovações</span>
                {countPending > 0 ? (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
                    {countPending}
                  </span>
                ) : null}
              </button>
            </div>

            {/* Project Filter if multiple */}
            {projects.length > 1 ? (
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="h-8 rounded-full border border-line bg-elevated px-3 text-xs text-ink outline-none"
              >
                <option value="all">Todos os Projetos</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>

        {/* Content Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {tab === "demandas" ? (
            <div>
              {/* Filter controls */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                {/* Format Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFormatFilter("all")}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      formatFilter === "all"
                        ? "bg-ink text-base font-semibold"
                        : "bg-elevated text-muted hover:text-ink",
                    )}
                  >
                    Todos os formatos
                  </button>
                  {FORMAT_OPTIONS.map((f) => {
                    const active = formatFilter === f.id;
                    const Icon = f.icon;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFormatFilter(f.id)}
                        className={cn(
                          "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                          active
                            ? "bg-ink text-base font-semibold"
                            : "bg-elevated text-muted hover:text-ink",
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {f.label}
                      </button>
                    );
                  })}
                </div>

                {/* Search input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                  <input
                    type="text"
                    placeholder="Filtrar por título..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 w-44 rounded-full border border-line bg-elevated pl-8 pr-3 text-xs text-ink placeholder:text-faint outline-none focus:w-56 focus:border-ink transition-all"
                  />
                </div>
              </div>

              {/* Grid of Demands */}
              {filtered.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center">
                  <Layers className="mb-3 h-8 w-8 text-faint" />
                  <p className="text-sm font-medium text-ink">Nenhuma solicitação encontrada</p>
                  <p className="mt-1 text-xs text-faint">
                    Faça sua primeira solicitação de demanda clicando no botão abaixo.
                  </p>
                  <Button onClick={() => setDemandDialogOpen(true)} size="sm" className="mt-4 gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Solicitar Demanda
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((task) => {
                    const proj = projects.find((p) => p.id === task.projectId);
                    const assignee = users.find((u) => u.id === task.assigneeId);
                    const refCount = task.referenceUrls
                      ?.split(/\r?\n/)
                      .filter((l) => Boolean(l.trim())).length ?? 0;
                    const attachmentsCount = task.attachments?.length ?? 0;

                    return (
                      <div
                        key={task.id}
                        onClick={() => setSelectedId(task.id)}
                        className="group flex flex-col justify-between rounded-2xl border border-line/70 bg-elevated p-4 shadow-sm transition-all hover:border-line hover:shadow-md cursor-pointer"
                      >
                        <div>
                          {/* Top Meta */}
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <TaskFormatBadge format={task.demandFormat} />
                              <TaskApprovalBadge status={task.approvalStatus} />
                            </div>
                            {task.dueDate ? (
                              <span className="text-[11px] text-faint">
                                {formatDay(task.dueDate)}
                              </span>
                            ) : null}
                          </div>

                          {/* Title */}
                          <h3 className="line-clamp-2 text-sm font-medium text-ink leading-snug">
                            {task.title}
                          </h3>

                          {/* Description snippet */}
                          {task.description ? (
                            <p className="mt-1.5 line-clamp-2 text-xs text-muted leading-relaxed">
                              {task.description}
                            </p>
                          ) : null}
                        </div>

                        {/* Footer Meta */}
                        <div className="mt-4 flex items-center justify-between border-t border-line-subtle pt-3 text-xs text-faint">
                          <div className="flex items-center gap-2">
                            {proj ? (
                              <span
                                className="flex items-center gap-1 text-[11px] font-medium"
                                style={{ color: proj.color }}
                              >
                                <span
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ backgroundColor: proj.color }}
                                />
                                {proj.name}
                              </span>
                            ) : null}
                            {refCount > 0 ? (
                              <span className="flex items-center gap-1 text-[11px] text-sky-400">
                                <Link2 className="h-3 w-3" />
                                {refCount}
                              </span>
                            ) : null}
                            {attachmentsCount > 0 ? (
                              <span className="flex items-center gap-1 text-[11px] text-muted">
                                <Paperclip className="h-3 w-3" />
                                {attachmentsCount}
                              </span>
                            ) : null}
                          </div>

                          <span className="text-[11px] text-muted truncate max-w-28">
                            {assignee ? assignee.name.split(" ")[0] : "Equipe"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Tab: Aprovações Board */
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* Coluna 1: Aguardando Aprovação */}
              <div className="flex flex-col rounded-2xl border border-amber-500/30 bg-elevated/40 p-4 min-h-[350px]">
                <div className="mb-3 flex items-center justify-between border-b border-line-subtle pb-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-400" />
                    <span className="text-xs font-semibold text-ink">Aguardando Aprovação</span>
                  </div>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                    {countPending}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {demandTasks
                    .filter((t) => t.approvalStatus === "pending")
                    .map((task) => (
                      <div
                        key={task.id}
                        onClick={() => setSelectedId(task.id)}
                        className="rounded-xl border border-line bg-base p-3 shadow-sm hover:border-line-subtle cursor-pointer transition-all"
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <TaskFormatBadge format={task.demandFormat} />
                          {task.dueDate ? (
                            <span className="text-[10px] text-faint">{formatDay(task.dueDate)}</span>
                          ) : null}
                        </div>
                        <h4 className="text-xs font-medium text-ink">{task.title}</h4>
                      </div>
                    ))}
                  {countPending === 0 ? (
                    <p className="py-10 text-center text-xs text-faint">
                      Nenhuma demanda aguardando aprovação
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Coluna 2: Ajustes Solicitados */}
              <div className="flex flex-col rounded-2xl border border-red-500/30 bg-elevated/40 p-4 min-h-[350px]">
                <div className="mb-3 flex items-center justify-between border-b border-line-subtle pb-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    <span className="text-xs font-semibold text-ink">Ajustes Solicitados</span>
                  </div>
                  <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                    {countChanges}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {demandTasks
                    .filter((t) => t.approvalStatus === "changes_requested")
                    .map((task) => (
                      <div
                        key={task.id}
                        onClick={() => setSelectedId(task.id)}
                        className="rounded-xl border border-line bg-base p-3 shadow-sm hover:border-line-subtle cursor-pointer transition-all"
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <TaskFormatBadge format={task.demandFormat} />
                          {task.dueDate ? (
                            <span className="text-[10px] text-faint">{formatDay(task.dueDate)}</span>
                          ) : null}
                        </div>
                        <h4 className="text-xs font-medium text-ink">{task.title}</h4>
                        {task.approvalFeedback ? (
                          <p className="mt-1.5 rounded-lg bg-red-950/30 border border-red-500/20 p-2 text-[11px] text-red-200 line-clamp-2">
                            {task.approvalFeedback}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  {countChanges === 0 ? (
                    <p className="py-10 text-center text-xs text-faint">
                      Nenhum ajuste pendente
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Coluna 3: Aprovadas */}
              <div className="flex flex-col rounded-2xl border border-emerald-500/30 bg-elevated/40 p-4 min-h-[350px]">
                <div className="mb-3 flex items-center justify-between border-b border-line-subtle pb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-ink">Aprovadas pelo Cliente</span>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                    {countApproved}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {demandTasks
                    .filter((t) => t.approvalStatus === "approved")
                    .map((task) => (
                      <div
                        key={task.id}
                        onClick={() => setSelectedId(task.id)}
                        className="rounded-xl border border-line bg-base p-3 shadow-sm hover:border-line-subtle cursor-pointer transition-all"
                      >
                        <div className="mb-1.5 flex items-center justify-between">
                          <TaskFormatBadge format={task.demandFormat} />
                          {task.approvedAt ? (
                            <span className="text-[10px] text-emerald-400">
                              {formatDay(task.approvedAt)}
                            </span>
                          ) : null}
                        </div>
                        <h4 className="text-xs font-medium text-ink">{task.title}</h4>
                      </div>
                    ))}
                  {countApproved === 0 ? (
                    <p className="py-10 text-center text-xs text-faint">
                      Nenhuma demanda aprovada ainda
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Task Viewer Sidebar / Modal */}
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

      {/* Demand Dialog */}
      <CreateDemandDialog
        open={demandDialogOpen}
        onClose={() => setDemandDialogOpen(false)}
        onDemandCreated={(task) => setSelectedId(task.id)}
      />

      {/* Share Verified Demand Link Dialog */}
      <ShareDemandLinkDialog
        open={shareLinkDialogOpen}
        onClose={() => setShareLinkDialogOpen(false)}
        defaultProjectId={projectFilter !== "all" ? projectFilter : undefined}
      />
    </div>
  );
}
