"use client";

import {
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Film,
  Filter,
  Layers,
  Link2,
  Paperclip,
  Plus,
  Search,
  Smartphone,
  Square,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TagChip } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import type { DemandFormat, Project, Tag, Task, User } from "@/lib/types";
import { TaskApprovalBadge, TaskFormatBadge } from "@/components/tasks/task-approval-badge";

const FORMAT_TABS: { id: DemandFormat | "all"; label: string; icon: typeof Square }[] = [
  { id: "all", label: "Todos os formatos", icon: Square },
  { id: "card", label: "Card", icon: Square },
  { id: "carrossel", label: "Carrossel", icon: Layers },
  { id: "video_longo", label: "Vídeo Longo", icon: Film },
  { id: "reels", label: "Reels", icon: Smartphone },
];

export function ProjectDemandsView({
  project,
  tasks,
  users,
  tags,
  onSelectTask,
  onCreateDemand,
}: {
  project: Project;
  tasks: Task[];
  users: User[];
  tags: Tag[];
  onSelectTask: (id: string) => void;
  onCreateDemand: () => void;
}) {
  const [formatFilter, setFormatFilter] = useState<DemandFormat | "all">("all");
  const [search, setSearch] = useState("");

  // Demands are either flagged isDemand: true, or have a demandFormat, or belong to sections called "Demandas"
  const demandTasks = useMemo(() => {
    return tasks.filter((t) => {
      const isDem =
        t.isDemand ||
        Boolean(t.demandFormat) ||
        t.section.toLowerCase().includes("demanda") ||
        t.tagIds.some((tagId) => {
          const name = tags.find((item) => item.id === tagId)?.name.toLowerCase() ?? "";
          return ["card", "carrossel", "reels", "vídeo longo", "video longo"].includes(name);
        });
      return isDem && !t.id.startsWith("hist-");
    });
  }, [tasks, tags]);

  const filtered = useMemo(() => {
    return demandTasks.filter((t) => {
      if (formatFilter !== "all") {
        const matchesFormat =
          t.demandFormat === formatFilter ||
          t.tagIds.some((tagId) => {
            const name = tags.find((item) => item.id === tagId)?.name.toLowerCase() ?? "";
            if (formatFilter === "card") return name === "card";
            if (formatFilter === "carrossel") return name === "carrossel";
            if (formatFilter === "reels") return name === "reels";
            if (formatFilter === "video_longo") return name.includes("video") || name.includes("vídeo");
            return false;
          });
        if (!matchesFormat) return false;
      }
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(query);
        const matchesDesc = t.description?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc) return false;
      }
      return true;
    });
  }, [demandTasks, formatFilter, search, tags]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-base p-6">
      {/* Top Header & Filter Controls */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-medium text-ink">Solicitações de Demandas</h2>
          <p className="text-xs text-faint">
            Gerencie e acompanhe todos os pedidos de cards, carrosséis, vídeos longos e reels.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              type="text"
              placeholder="Buscar demandas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-48 rounded-full border border-line bg-elevated pl-9 pr-3 text-xs text-ink placeholder:text-faint outline-none focus:border-ink focus:w-60 transition-all"
            />
          </div>

          <Button onClick={onCreateDemand} className="gap-2 bg-gradient-to-r from-sky-500 to-indigo-600 text-white">
            <Plus className="h-4 w-4" />
            Solicitar Demanda
          </Button>
        </div>
      </div>

      {/* Format Filter Pills */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5 border-b border-line-subtle pb-3">
        {FORMAT_TABS.map((tab) => {
          const active = formatFilter === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFormatFilter(tab.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-ink text-base font-semibold shadow-sm"
                  : "bg-elevated/70 text-muted hover:bg-hover hover:text-ink",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.id !== "all" && (
                <span className="ml-1 text-[10px] opacity-70">
                  {
                    demandTasks.filter((t) => {
                      return (
                        t.demandFormat === tab.id ||
                        t.tagIds.some((tagId) => {
                          const n = tags.find((tg) => tg.id === tagId)?.name.toLowerCase() ?? "";
                          if (tab.id === "card") return n === "card";
                          if (tab.id === "carrossel") return n === "carrossel";
                          if (tab.id === "reels") return n === "reels";
                          if (tab.id === "video_longo") return n.includes("video") || n.includes("vídeo");
                          return false;
                        })
                      );
                    }).length
                  }
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Demands List */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-hover text-faint">
              <Layers className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-ink">Nenhuma demanda encontrada</p>
            <p className="mt-1 text-xs text-faint">
              {demandTasks.length === 0
                ? "Este projeto ainda não possui solicitações de demandas cadastradas."
                : "Nenhuma demanda corresponde ao filtro selecionado."}
            </p>
            <Button onClick={onCreateDemand} size="sm" className="mt-4 gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Fazer Primeira Solicitação
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((task) => {
              const assignee = users.find((u) => u.id === task.assigneeId);
              const taskTags = tags.filter((t) => task.tagIds.includes(t.id));
              const refCount = task.referenceUrls
                ?.split(/\r?\n/)
                .filter((l) => Boolean(l.trim())).length ?? 0;
              const attachmentsCount = task.attachments?.length ?? 0;

              return (
                <div
                  key={task.id}
                  onClick={() => onSelectTask(task.id)}
                  className="group flex flex-col justify-between rounded-2xl border border-line/70 bg-elevated p-4 shadow-sm transition-all hover:border-line hover:shadow-md cursor-pointer"
                >
                  <div>
                    {/* Top Badges */}
                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <TaskFormatBadge format={task.demandFormat} />
                        <TaskApprovalBadge status={task.approvalStatus} />
                      </div>
                      <span className="text-[11px] text-faint">
                        {task.dueDate ? `Prazo: ${formatDay(task.dueDate)}` : "Sem prazo"}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="line-clamp-2 text-sm font-medium text-ink group-hover:text-ink">
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
                      {refCount > 0 ? (
                        <span title={`${refCount} link(s) de referência`} className="flex items-center gap-1 text-[11px] text-sky-400">
                          <Link2 className="h-3 w-3" />
                          {refCount}
                        </span>
                      ) : null}

                      {attachmentsCount > 0 ? (
                        <span title={`${attachmentsCount} anexo(s)`} className="flex items-center gap-1 text-[11px] text-muted">
                          <Paperclip className="h-3 w-3" />
                          {attachmentsCount}
                        </span>
                      ) : null}

                      {taskTags.length > 0 ? (
                        <div className="flex items-center gap-1">
                          {taskTags.slice(0, 2).map((tg) => (
                            <span
                              key={tg.id}
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: tg.color }}
                              title={tg.name}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {assignee ? (
                        <span className="truncate max-w-28 text-[11px] text-muted">
                          {assignee.name.split(" ")[0]}
                        </span>
                      ) : (
                        <span className="text-[11px] text-faint">Não atribuído</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
