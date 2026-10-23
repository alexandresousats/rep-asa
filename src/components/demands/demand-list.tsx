"use client";

import { Link2, Paperclip, Plus, Search } from "lucide-react";
import type { ReactNode } from "react";
import { FORMAT_OPTIONS } from "@/components/demands/create-demand-dialog";
import { TaskApprovalBadge, TaskFormatBadge } from "@/components/tasks/task-approval-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import type { DemandFormat, Task } from "@/lib/types";

export function DemandsList({
  filtered,
  formatFilter,
  setFormatFilter,
  search,
  setSearch,
  projects,
  users,
  onSelect,
  onCreate,
  actions,
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
  actions?: ReactNode;
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
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {actions}
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
  children: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
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
      className="group flex cursor-pointer flex-col rounded-[20px] bg-elevated p-5 text-left transition-colors hover:bg-hover"
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
