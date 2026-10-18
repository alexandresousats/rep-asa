"use client";

import { Plus } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MonthCalendar } from "@/components/calendar/month-calendar";
import { TaskKanban } from "@/components/tasks/task-kanban";
import { TaskList } from "@/components/tasks/task-list";
import { TaskViewer } from "@/components/tasks/task-panel";
import { ProjectTimeline } from "@/components/timeline/project-timeline";
import { Button } from "@/components/ui/button";
import { addProjectMember, createSection, createTask, renameSection, reorderTasks } from "@/lib/api";
import { cn } from "@/lib/cn";
import { usePrefs } from "@/lib/prefs";
import type { ProjectView, User } from "@/lib/types";
import { useAccess, useWorkspace } from "@/lib/workspace";

const VIEWS: { id: ProjectView; label: string }[] = [
  { id: "lista", label: "Lista" },
  { id: "kanban", label: "Kanban" },
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
  const [month, setMonth] = useState(new Date(2026, 9, 1));
  const [freshTaskId, setFreshTaskId] = useState<string | null>(null);
  const [localTask, setLocalTask] = useState<string | null>(null);
  const [pickedSection, setPickedSection] = useState<string | null>(null);
  const [draftSection, setDraftSection] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const ignoreSectionBlur = useRef(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const projects = useWorkspace((state) => state.projects);
  const allTasks = useWorkspace((state) => state.tasks);
  const users = useWorkspace((state) => state.users);
  const tags = useWorkspace((state) => state.tags);
  const taskView = usePrefs((state) => state.taskView);
  const setTaskView = usePrefs((state) => state.setTaskView);
  const { isAdmin, canWrite } = useAccess();
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
    if (next.task !== undefined) {
      setLocalTask(next.task);
      if (next.task !== freshTaskId) setFreshTaskId(null);
    }
    const query = new URLSearchParams(searchParams.toString());
    if (next.view) query.set("view", next.view);
    if (next.task === null) query.delete("task");
    if (typeof next.task === "string") query.set("task", next.task);
    router.replace(`/projetos/${params.id}?${query.toString()}`);
  }

  useEffect(() => {
    if (!addMenu) return;
    function onPointer(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (addMenuRef.current?.contains(target)) return;
      setAddMenu(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setAddMenu(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [addMenu]);

  if (!project) {
    return <div className="px-6 py-10 text-sm text-faint">Projeto não encontrado.</div>;
  }

  const current = project;
  const sections = current.sections?.length ? current.sections : ["Geral"];
  const activeSection =
    pickedSection && sections.includes(pickedSection) ? pickedSection : sections[0];
  const listed = tasks.filter((task) => task.section === activeSection);

  function commitSection(name: string) {
    const trimmed = name.trim();
    setDraftSection(null);
    if (!trimmed) return;
    void createSection(current.id, trimmed)
      .then((created) => {
        if (created) setPickedSection(created);
      })
      .catch(() => undefined);
  }

  function commitRename(from: string, name: string) {
    setEditingSection(null);
    void renameSection(current.id, from, name)
      .then((next) => {
        if (next) setPickedSection(next);
      })
      .catch(() => undefined);
  }

  function addTask(section = activeSection) {
    void createTask({
      projectId: current.id,
      title: "Nova tarefa",
      section,
    }).then((task) => {
      setPickedSection(section);
      setQuery({ task: task.id });
      setFreshTaskId(task.id);
    });
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-line-subtle px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              <h1 className="text-lg font-medium text-ink">{project.name}</h1>
            </div>
            {isAdmin ? (
              <MemberAdd projectId={project.id} memberIds={project.memberIds} users={users} />
            ) : null}
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
          {isAdmin ? (
          <div ref={addMenuRef} className="relative">
            <Button
              aria-expanded={addMenu}
              aria-haspopup="menu"
              onClick={() => setAddMenu((open) => !open)}
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
            {addMenu ? (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-2 min-w-36 rounded-2xl border border-line bg-elevated p-1"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAddMenu(false);
                    addTask();
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-hover"
                >
                  Tarefa
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAddMenu(false);
                    setDraftSection("");
                    if (view !== "lista") setQuery({ view: "lista" });
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-hover"
                >
                  Sessão
                </button>
              </div>
            ) : null}
          </div>
          ) : null}
        </div>

        <div className={cn("min-h-0 flex-1", view === "kanban" || view === "cronograma" ? "overflow-hidden" : "overflow-y-auto overscroll-contain")}>
        {view === "lista" ? (
          <>
            <div className="flex items-center gap-1 overflow-x-auto px-6 pt-4">
              {sections.map((section) =>
                editingSection === section ? (
                  <form
                    key={section}
                    onSubmit={(event) => {
                      event.preventDefault();
                      commitRename(
                        section,
                        event.currentTarget.querySelector("input")?.value ?? "",
                      );
                    }}
                  >
                    <input
                      autoFocus
                      defaultValue={section}
                      aria-label="Título da sessão"
                      onFocus={(event) => event.currentTarget.select()}
                      onKeyDown={(event) => {
                        if (event.key !== "Escape") return;
                        event.preventDefault();
                        ignoreSectionBlur.current = true;
                        setEditingSection(null);
                      }}
                      onBlur={(event) => {
                        if (ignoreSectionBlur.current) {
                          ignoreSectionBlur.current = false;
                          return;
                        }
                        commitRename(section, event.currentTarget.value);
                      }}
                      className="h-7 w-36 rounded-full bg-elevated px-3 text-xs text-ink outline-none"
                    />
                  </form>
                ) : (
                  <button
                    key={section}
                    type="button"
                    onClick={() => setPickedSection(section)}
                    onDoubleClick={() => {
                      if (isAdmin) setEditingSection(section);
                    }}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1 text-xs",
                      section === activeSection
                        ? "bg-elevated text-ink"
                        : "text-faint hover:text-ink",
                    )}
                  >
                    {section}
                  </button>
                ),
              )}
              {draftSection !== null ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    commitSection(
                      event.currentTarget.querySelector("input")?.value ?? "",
                    );
                  }}
                >
                  <input
                    autoFocus
                    value={draftSection}
                    onChange={(event) => setDraftSection(event.target.value)}
                    onBlur={(event) => commitSection(event.currentTarget.value)}
                    placeholder="Nova sessão"
                    className="h-7 w-36 rounded-full bg-elevated px-3 text-xs text-ink outline-none placeholder:text-faint"
                  />
                </form>
              ) : isAdmin ? (
                <button
                  type="button"
                  aria-label="Nova sessão"
                  onClick={() => setDraftSection("")}
                  className="rounded-full p-1 text-faint hover:text-ink"
                >
                  <Plus className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <TaskList
                tasks={listed}
                users={users}
                tags={tags}
                selectedId={selectedId}
                onSelect={(id) => setQuery({ task: id })}
                onReorder={canWrite ? reorderTasks : undefined}
              />
            </div>
          </>
        ) : null}

        {view === "cronograma" ? (
          <ProjectTimeline
            tasks={tasks}
            tags={tags}
            users={users}
            sections={sections}
            accent={project.color}
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

        {view === "kanban" ? (
          <TaskKanban
            sections={sections}
            tasks={tasks}
            users={users}
            tags={tags}
            selectedId={selectedId}
            onSelect={(id) => setQuery({ task: id })}
            onCreate={isAdmin ? addTask : () => undefined}
            draggable={canWrite}
          />
        ) : null}
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
          onClose={() => setQuery({ task: null })}
          subtasks={tasks.filter((task) => task.parentId === selected.id)}
          onOpenSubtask={(id) => setQuery({ task: id })}
          startEditing={selected.id === freshTaskId}
        />
      ) : null}
    </div>
  );
}

function MemberAdd({
  projectId,
  memberIds,
  users,
}: {
  projectId: string;
  memberIds: string[];
  users: User[];
}) {
  const [userId, setUserId] = useState("");
  const options = users.filter(
    (user) => user.membershipStatus !== "pending" && !memberIds.includes(user.id),
  );
  if (options.length === 0) return null;
  return (
    <form
      className="mt-3 flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!userId) return;
        void addProjectMember(projectId, userId).then(() => setUserId(""));
      }}
    >
      <select
        value={userId}
        onChange={(event) => setUserId(event.target.value)}
        className="h-8 rounded-full border border-line bg-base px-3 text-xs text-ink"
      >
        <option value="">Adicionar membro</option>
        {options.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!userId}
        className="text-xs text-faint hover:text-ink disabled:opacity-40"
      >
        Incluir
      </button>
    </form>
  );
}
