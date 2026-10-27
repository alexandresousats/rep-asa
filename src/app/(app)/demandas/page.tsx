"use client";

import { ChevronRight, Link2, Plus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CreateDemandDialog } from "@/components/demands/create-demand-dialog";
import { DemandsWorkspace } from "@/components/demands/demands-workspace";
import { ShareDemandLinkDialog } from "@/components/demands/share-demand-link-dialog";
import { MaintenanceGate } from "@/components/layout/maintenance-gate";
import { TaskViewer } from "@/components/tasks/task-panel";
import { usePrefs } from "@/lib/prefs";
import { useAccess, useWorkspace } from "@/lib/workspace";

export default function DemandsPage() {
  const [projectFilter, setProjectFilter] = useState<string>("all");
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

  const selected = useMemo(
    () => allTasks.find((t) => t.id === selectedId) ?? null,
    [allTasks, selectedId],
  );

  return (
    <MaintenanceGate description="As demandas estão temporariamente indisponíveis enquanto fazemos melhorias. Volte em breve.">
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
            className="mb-6 flex w-full cursor-pointer items-center justify-between gap-3 rounded-[20px] bg-elevated px-5 py-4 text-left transition-colors hover:bg-hover"
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

          <DemandsWorkspace
            tasks={allTasks}
            projects={projects}
            users={users}
            tags={tags}
            onSelect={setSelectedId}
            onCreate={() => setDemandDialogOpen(true)}
            onProjectFilterChange={setProjectFilter}
          />
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
    </MaintenanceGate>
  );
}
