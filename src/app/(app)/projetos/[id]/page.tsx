"use client";

import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { MonthCalendar } from "@/components/calendar/month-calendar";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { TaskKanban } from "@/components/tasks/task-kanban";
import { TaskList } from "@/components/tasks/task-list";
import { TaskViewer } from "@/components/tasks/task-panel";
import { ProjectPanel } from "@/components/projects/project-panel";
import { ProjectTimeline } from "@/components/timeline/project-timeline";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SectionBar } from "@/components/projects/section-bar";
import { addProjectMember, createTask, deleteProject, reorderTasks } from "@/lib/api";
import { cn } from "@/lib/cn";
import { usePrefs } from "@/lib/prefs";
import type { ProjectView, User } from "@/lib/types";
import { useAccess, useWorkspace } from "@/lib/workspace";

const VIEWS: { id: ProjectView; label: string }[] = [
  { id: "lista", label: "Lista" },
  { id: "kanban", label: "Kanban" },
  { id: "cronograma", label: "Cronograma" },
  { id: "calendario", label: "Calendário" },
  { id: "painel", label: "Painel" },
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
  const [pendingSection, setPendingSection] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const [memberOpen, setMemberOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
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
              {isAdmin ? (
                <button
                  type="button"
                  aria-label="Editar projeto"
                  onClick={() => setEditingInfo(true)}
                  className="rounded-full p-1 text-faint hover:bg-hover hover:text-ink"
                >
                  <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
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
          <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setDeleteError("");
              setConfirmDelete(true);
            }}
            className="text-xs text-faint hover:text-ink"
          >
            Excluir projeto
          </button>
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
                    setPendingSection(true);
                    if (view !== "lista") setQuery({ view: "lista" });
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-hover"
                >
                  Sessão
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAddMenu(false);
                    setMemberOpen(true);
                  }}
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-hover"
                >
                  Membro
                </button>
              </div>
            ) : null}
          </div>
          </div>
          ) : null}
        </div>

        <div className={cn("min-h-0 flex-1", view === "kanban" || view === "cronograma" ? "overflow-hidden" : "overflow-y-auto overscroll-contain")}>
        {view === "lista" ? (
          <>
            <SectionBar
              projectId={current.id}
              sections={sections}
              active={activeSection}
              accent={project.color}
              canManage={isAdmin}
              onSelect={setPickedSection}
              pendingDraft={pendingSection}
              onDraftOpened={() => setPendingSection(false)}
            />
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

        {view === "painel" ? (
          <ProjectPanel
            tasks={tasks}
            users={users}
            tags={tags}
            sections={sections}
            accent={project.color}
            onSelect={(id) => setQuery({ task: id })}
          />
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
      {editingInfo ? (
        <EditProjectDialog project={project} onClose={() => setEditingInfo(false)} />
      ) : null}
      <MemberDialog
        open={memberOpen}
        projectId={project.id}
        memberIds={project.memberIds}
        users={users}
        onClose={() => setMemberOpen(false)}
      />
      <Dialog
        open={confirmDelete}
        title="Excluir projeto"
        onClose={() => {
          if (!deleting) setConfirmDelete(false);
        }}
      >
        <p className="text-sm leading-6 text-faint">
          {project.name} e todas as tarefas deste projeto serão excluídos.
        </p>
        {deleteError ? <p className="mt-3 text-sm text-red-400">{deleteError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={deleting}
            onClick={() => setConfirmDelete(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={deleting}
            onClick={() => {
              setDeleting(true);
              setDeleteError("");
              void deleteProject(project.id).then((result) => {
                setDeleting(false);
                if (!result.ok) {
                  setDeleteError(result.error);
                  return;
                }
                router.push("/projetos");
              });
            }}
          >
            Excluir
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function MemberDialog({
  open,
  projectId,
  memberIds,
  users,
  onClose,
}: {
  open: boolean;
  projectId: string;
  memberIds: string[];
  users: User[];
  onClose: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const options = users.filter(
    (user) => user.membershipStatus !== "pending" && !memberIds.includes(user.id),
  );
  const pending = users.filter((user) => user.membershipStatus === "pending");

  return (
    <Dialog
      open={open}
      title="Adicionar membro"
      onClose={() => {
        if (!busyId) onClose();
      }}
    >
      <p className="text-sm leading-6 text-faint">
        Inclui neste projeto alguém que já faz parte do espaço. O convite da Equipe só entra no
        espaço e não coloca a pessoa aqui.
      </p>
      {options.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {options.map((user) => (
            <li key={user.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-ink">{user.name}</span>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => {
                  setBusyId(user.id);
                  setError("");
                  void addProjectMember(projectId, user.id)
                    .then(() => setBusyId(null))
                    .catch((reason: unknown) => {
                      setBusyId(null);
                      setError(
                        reason instanceof Error ? reason.message : "Não foi possível incluir esta pessoa.",
                      );
                    });
                }}
                className="shrink-0 text-xs text-faint hover:text-ink disabled:opacity-40"
              >
                {busyId === user.id ? "Incluindo" : "Incluir"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm leading-6 text-faint">
          Não há ninguém do espaço fora deste projeto.
        </p>
      )}
      {pending.length > 0 ? (
        <p className="mt-4 text-sm leading-6 text-faint">
          {pending.map((user) => user.name).join(", ")} ainda não aceitou o convite do espaço.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      <p className="mt-5 text-sm text-faint">
        <Link href="/equipe" className="text-ink hover:underline" onClick={onClose}>
          Convidar para o espaço
        </Link>
      </p>
    </Dialog>
  );
}
