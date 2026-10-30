"use client";

import { endOfWeek, startOfDay } from "date-fns";
import { AppWindow, Check, ChevronDown, PanelRight, Plus } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { TaskAssigneePicker } from "@/components/tasks/task-assignee-picker";
import { TaskDatePicker } from "@/components/tasks/task-date-picker";
import { SubtaskMark } from "@/components/tasks/task-list";
import { TaskViewer } from "@/components/tasks/task-panel";
import { TaskProjectPicker } from "@/components/tasks/task-project-picker";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { createTask, setTaskStatus, updateTask } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { parseDate } from "@/lib/dates";
import { PRIORITY_ORDER } from "@/lib/priority";
import { usePrefs } from "@/lib/prefs";
import type { Project, Task, TaskViewMode, User } from "@/lib/types";
import { useAccess, useWorkspace } from "@/lib/workspace";

const COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_7.5rem_9.5rem_11rem_4.75rem] items-center gap-2";

type Scope = "open" | "done";

const SCOPES: { id: Scope; label: string }[] = [
  { id: "open", label: "Abertas" },
  { id: "done", label: "Concluídas" },
];

export default function MyTasksPage() {
  const [scope, setScope] = useState<Scope>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const user = useWorkspace((state) => state.user);
  const allTasks = useWorkspace((state) => state.tasks);
  const projects = useWorkspace((state) => state.projects);
  const users = useWorkspace((state) => state.users);
  const tags = useWorkspace((state) => state.tags);
  const taskView = usePrefs((state) => state.taskView);
  const setTaskView = usePrefs((state) => state.setTaskView);
  const { canWrite } = useAccess();

  const tasks = useMemo(
    () => allTasks.filter((task) => !task.id.startsWith("hist-")),
    [allTasks],
  );
  const mine = useMemo(
    () => tasks.filter((task) => task.assigneeId === user?.id),
    [tasks, user?.id],
  );
  const openTasks = useMemo(
    () => mine.filter((task) => task.status !== "done"),
    [mine],
  );
  const doneTasks = useMemo(
    () => mine.filter((task) => task.status === "done"),
    [mine],
  );
  const today = startOfDay(new Date());
  const overdue = openTasks.filter((task) => {
    if (!task.dueDate) return false;
    return startOfDay(parseDate(task.dueDate)) < today;
  }).length;

  const groups = useMemo(() => {
    if (scope === "done") {
      return doneTasks.length
        ? [{ id: "done", name: "Concluídas", href: null as string | null, rows: nestAssigned(doneTasks, scope) }]
        : [];
    }
    const buckets = [
      { id: "overdue", name: "Atrasadas" },
      { id: "today", name: "Hoje" },
      { id: "week", name: "Esta semana" },
      { id: "later", name: "Depois" },
      { id: "none", name: "Sem data" },
    ];
    const todayKey = startOfDay(new Date());
    const weekEnd = startOfDay(endOfWeek(todayKey, { weekStartsOn: 1 }));
    const placed = new Map<string, Task[]>();
    for (const task of openTasks) {
      const id = dueBucket(task, todayKey, weekEnd);
      const list = placed.get(id) ?? [];
      list.push(task);
      placed.set(id, list);
    }
    return buckets.flatMap((bucket) => {
      const items = placed.get(bucket.id);
      if (!items?.length) return [];
      return [{ id: bucket.id, name: bucket.name, href: null as string | null, rows: nestAssigned(items, scope) }];
    });
  }, [doneTasks, openTasks, scope]);

  const selected = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? null,
    [tasks, selectedId],
  );

  function openTask(id: string, mode?: TaskViewMode) {
    if (mode) setTaskView(mode);
    setSelectedId(id);
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-medium tracking-tight text-ink">
                Minhas tarefas
              </h1>
              <p className="mt-1 text-sm text-faint">
                {mine.length === 0
                  ? "Nada atribuído a você nos projetos deste espaço."
                  : openTasks.length === 0
                    ? "Nenhuma tarefa aberta atribuída a você."
                    : `${openTasks.length} ${openTasks.length === 1 ? "aberta" : "abertas"}${
                        overdue > 0
                          ? ` · ${overdue} ${overdue === 1 ? "atrasada" : "atrasadas"}`
                          : ""
                      }`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1">
                {SCOPES.map((item) => {
                  const count = item.id === "done" ? doneTasks.length : openTasks.length;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setScope(item.id)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs",
                        scope === item.id
                          ? "bg-elevated text-ink"
                          : "text-faint hover:text-ink",
                      )}
                    >
                      {item.label}
                      <span className="ml-1.5 text-faint">{count}</span>
                    </button>
                  );
                })}
              </div>
              {canWrite ? (
                <Button
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  disabled={projects.length === 0}
                  title={
                    projects.length === 0
                      ? "Crie um projeto para adicionar tarefas"
                      : undefined
                  }
                >
                  <Plus className="h-4 w-4" />
                  Criar tarefa
                </Button>
              ) : null}
            </div>
          </div>

          {groups.length === 0 ? (
            <p className="text-sm text-faint">
              {scope === "done"
                ? "Você ainda não concluiu tarefas atribuídas a você."
                : "Nenhuma tarefa aberta atribuída a você."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[760px] space-y-8">
              <div className={cn(COLUMNS, "px-2 text-xs text-faint")}>
                <span>Nome</span>
                <span>Data</span>
                <span>Responsável</span>
                <span>Projeto</span>
                <span className="text-right">Abrir</span>
              </div>
              {groups.map((group) => {
                const open = !collapsed[group.id];
                return (
                <section key={group.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((current) => ({
                        ...current,
                        [group.id]: !current[group.id],
                      }))
                    }
                    className="mb-2 flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-hover"
                    aria-expanded={open}
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-faint transition-transform",
                        !open && "-rotate-90",
                      )}
                      strokeWidth={1.5}
                    />
                    <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                      {group.name}
                    </span>
                    <span className="text-xs text-faint">{group.rows.length}</span>
                  </button>
                  {open ? (
                  <div>
                    {group.rows.map(({ task, nested }) => {
                      const parent = task.parentId
                        ? tasks.find((item) => item.id === task.parentId)
                        : null;
                      const metaExtras: string[] = [];
                      if (parent) metaExtras.push(`Subtarefa de ${parent.title}`);
                      if (task.status === "doing") metaExtras.push("Em andamento");
                      if (task.section) metaExtras.push(task.section);
                      return (
                        <div
                          key={task.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openTask(task.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") openTask(task.id);
                          }}
                          className={cn(
                            COLUMNS,
                            "cursor-pointer rounded-2xl px-2 py-2 text-left hover:bg-hover",
                            selectedId === task.id && "bg-elevated",
                            task.status === "done" && "opacity-60",
                          )}
                        >
                          <span className={cn("flex min-w-0 items-center gap-3", nested && "pl-6")}>
                            {nested ? <SubtaskMark /> : null}
                            <button
                              type="button"
                              aria-label={
                                task.status === "done" ? "Reabrir tarefa" : "Concluir tarefa"
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!canWrite) return;
                                setTaskStatus(
                                  task.id,
                                  task.status === "done" ? "todo" : "done",
                                );
                              }}
                              onKeyDown={stopRowClick}
                              className="shrink-0 cursor-pointer"
                            >
                              {task.status === "done" ? (
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                                  <Check className="h-3 w-3" strokeWidth={3} />
                                </span>
                              ) : (
                                <span className="inline-flex h-4 w-4 rounded-full border border-line" />
                              )}
                            </button>
                            <span className="min-w-0">
                              <span
                                className={cn(
                                  "block truncate text-sm text-ink",
                                  task.status === "done" && "text-faint line-through",
                                )}
                              >
                                {task.title}
                              </span>
                              {metaExtras.length > 0 ? (
                                <span className="mt-0.5 block truncate text-xs text-faint">
                                  {metaExtras.join(" · ")}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <span onClick={stopRowClick} onKeyDown={stopRowClick}>
                            <TaskDatePicker
                              dueDate={task.dueDate}
                              canWrite={canWrite}
                              variant="cell"
                              onChange={(dueDate) =>
                                updateTask(task.id, {
                                  dueDate,
                                  startDate: dueDate || task.startDate,
                                })
                              }
                            />
                          </span>
                          <span onClick={stopRowClick} onKeyDown={stopRowClick}>
                            <TaskAssigneePicker
                              assigneeId={task.assigneeId}
                              users={users}
                              canWrite={canWrite}
                              variant="cell"
                              onSelect={(assigneeId) => updateTask(task.id, { assigneeId })}
                            />
                          </span>
                          <span onClick={stopRowClick} onKeyDown={stopRowClick}>
                            <TaskProjectPicker
                              projectId={task.projectId}
                              section={task.section}
                              projects={projects}
                              canWrite={canWrite}
                              variant="cell"
                              onChangeProject={(projectId, section) =>
                                updateTask(task.id, { projectId, section })
                              }
                              onChangeSection={(section) => updateTask(task.id, { section })}
                            />
                          </span>
                          <span
                            className="flex justify-end gap-0.5"
                            onClick={stopRowClick}
                            onKeyDown={stopRowClick}
                          >
                            <button
                              type="button"
                              aria-label="Abrir no painel lateral"
                              title="Abrir no painel lateral"
                              onClick={() => openTask(task.id, "sidebar")}
                              className={cn(
                                "rounded-lg p-1.5",
                                selectedId === task.id && taskView === "sidebar"
                                  ? "bg-hover text-ink"
                                  : "text-faint hover:bg-hover hover:text-ink",
                              )}
                            >
                              <PanelRight className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              aria-label="Abrir em popup"
                              title="Abrir em popup"
                              onClick={() => openTask(task.id, "modal")}
                              className={cn(
                                "rounded-lg p-1.5",
                                selectedId === task.id && taskView === "modal"
                                  ? "bg-hover text-ink"
                                  : "text-faint hover:bg-hover hover:text-ink",
                              )}
                            >
                              <AppWindow className="h-4 w-4" strokeWidth={1.5} />
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  ) : null}
                </section>
              );
              })}
              </div>
            </div>
          )}
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
          subtasks={tasks.filter((task) => task.parentId === selected.id)}
          onOpenSubtask={setSelectedId}
        />
      ) : null}
      {createOpen ? (
        <CreateTaskDialog
          projects={projects}
          users={users}
          defaultAssigneeId={user?.id ?? null}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            openTask(id, "sidebar");
          }}
        />
      ) : null}
    </div>
  );
}

function stopRowClick(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

function firstSection(project: Project | undefined) {
  return project?.sections?.[0] || "Geral";
}

function CreateTaskDialog({
  projects,
  users,
  defaultAssigneeId,
  onClose,
  onCreated,
}: {
  projects: Project[];
  users: User[];
  defaultAssigneeId: string | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const first = projects[0];
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(first?.id ?? "");
  const [section, setSection] = useState(firstSection(first));
  const [assigneeId, setAssigneeId] = useState<string | null>(defaultAssigneeId);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = title.trim();
    if (!name || !projectId || saving) return;
    setSaving(true);
    setError("");
    try {
      const task = await createTask({
        projectId,
        title: name,
        assigneeId,
        dueDate,
        startDate: dueDate,
        section,
      });
      onCreated(task.id);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Não foi possível criar a tarefa.",
      );
      setSaving(false);
    }
  }

  return (
    <Dialog open title="Nova tarefa" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Nome da tarefa"
          aria-label="Nome da tarefa"
          className="w-full rounded-xl border border-line bg-base px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-ink"
        />
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-faint">Projeto</span>
            <TaskProjectPicker
              projectId={projectId}
              section={section}
              projects={projects}
              canWrite
              onChangeProject={(nextProjectId, nextSection) => {
                setProjectId(nextProjectId);
                setSection(nextSection);
              }}
              onChangeSection={setSection}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-faint">Responsável</span>
            <TaskAssigneePicker
              assigneeId={assigneeId}
              users={users}
              canWrite
              onSelect={setAssigneeId}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-faint">Data</span>
            <TaskDatePicker dueDate={dueDate} canWrite onChange={setDueDate} />
          </div>
        </div>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!title.trim() || !projectId || saving}>
            {saving ? "Criando..." : "Criar tarefa"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function dueBucket(task: Task, today: Date, weekEnd: Date) {
  if (!task.dueDate) return "none";
  const due = startOfDay(parseDate(task.dueDate));
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  if (due <= weekEnd) return "week";
  return "later";
}

function nestAssigned(items: Task[], scope: Scope) {
  const ids = new Set(items.map((task) => task.id));
  const roots = sortTasks(
    items.filter((task) => !task.parentId || !ids.has(task.parentId)),
    scope,
  );
  return roots.flatMap((task) => {
    const children = sortTasks(
      items.filter((child) => child.parentId === task.id),
      scope,
    );
    return [
      { task, nested: Boolean(task.parentId) },
      ...children.map((child) => ({ task: child, nested: true })),
    ];
  });
}

function sortTasks(items: Task[], scope: Scope) {
  return items.slice().sort((a, b) => {
    if (scope === "done") {
      return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
    }
    const aDue = a.dueDate
      ? startOfDay(parseDate(a.dueDate)).getTime()
      : Number.POSITIVE_INFINITY;
    const bDue = b.dueDate
      ? startOfDay(parseDate(b.dueDate)).getTime()
      : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    const priority =
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
    if (priority !== 0) return priority;
    return a.title.localeCompare(b.title, "pt-BR");
  });
}
