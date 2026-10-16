"use client";

import { Plus } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { MonthCalendar } from "@/components/calendar/month-calendar";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { TaskList } from "@/components/tasks/task-list";
import { TaskPanel } from "@/components/tasks/task-panel";
import { ProjectTimeline } from "@/components/timeline/project-timeline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ProjectView } from "@/lib/types";
import { useAppStore } from "@/lib/store";

const VIEWS: { id: ProjectView; label: string }[] = [
  { id: "lista", label: "Lista" },
  { id: "cronograma", label: "Cronograma" },
  { id: "calendario", label: "Calendário" },
];

export default function ProjectPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-base" />}>
      <ProjectWorkspace />
    </Suspense>
  );
}

function ProjectWorkspace() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [month, setMonth] = useState(new Date(2026, 9, 1));
  const [localTask, setLocalTask] = useState<string | null>(null);

  const projects = useAppStore((state) => state.projects);
  const allTasks = useAppStore((state) => state.tasks);
  const users = useAppStore((state) => state.users);
  const tags = useAppStore((state) => state.tags);
  const project = projects.find((item) => item.id === params.id);
  const tasks = useMemo(
    () =>
      allTasks.filter(
        (task) => task.projectId === params.id && !task.id.startsWith("hist-"),
      ),
    [allTasks, params.id],
  );

  const view = (searchParams.get("view") as ProjectView) || "lista";
  const selectedId = localTask ?? searchParams.get("task");
  const selected = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? null,
    [tasks, selectedId],
  );

  function setQuery(next: { view?: ProjectView; task?: string | null }) {
    if (next.task !== undefined) setLocalTask(next.task);
    const query = new URLSearchParams(searchParams.toString());
    if (next.view) query.set("view", next.view);
    if (next.task === null) query.delete("task");
    if (typeof next.task === "string") query.set("task", next.task);
    router.replace(`/projetos/${params.id}?${query.toString()}`);
  }

  if (!project) {
    return <div className="px-6 py-10 text-sm text-faint">Projeto não encontrado.</div>;
  }

  return (
    <div className="flex min-h-full">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-subtle px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              <h1 className="text-lg font-medium text-ink">{project.name}</h1>
            </div>
            <div className="mt-3 flex gap-1">
              {VIEWS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setQuery({ view: item.id })}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs",
                    view === item.id
                      ? "bg-elevated text-ink"
                      : "text-faint hover:text-ink",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Adicionar tarefa
          </Button>
        </div>

        {view === "lista" ? (
          <div className="overflow-x-auto">
            <TaskList
              tasks={tasks}
              users={users}
              tags={tags}
              selectedId={selectedId}
              onSelect={(id) => setQuery({ task: id })}
            />
          </div>
        ) : null}

        {view === "cronograma" ? (
          <ProjectTimeline
            tasks={tasks}
            tags={tags}
            selectedId={selectedId}
            onSelect={(id) => setQuery({ task: id })}
          />
        ) : null}

        {view === "calendario" ? (
          <div className="p-6">
            <MonthCalendar
              month={month}
              onMonthChange={setMonth}
              tasks={tasks}
              tags={tags}
              selectedId={selectedId}
              onSelect={(id) => setQuery({ task: id })}
            />
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="hidden shrink-0 lg:block">
          <TaskPanel
            resizable
            task={selected}
            users={users}
            tags={tags}
            projects={projects}
            onClose={() => setQuery({ task: null })}
          />
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setQuery({ task: null })}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-md">
            <TaskPanel
              task={selected}
              users={users}
              tags={tags}
              projects={projects}
              onClose={() => setQuery({ task: null })}
            />
          </div>
        </div>
      ) : null}

      <CreateTaskDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projectId={project.id}
        users={users}
        tags={tags}
      />
    </div>
  );
}
