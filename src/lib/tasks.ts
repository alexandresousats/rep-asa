import type { Project, Subtask, Task } from "./types";

export function expandSubtasks(tasks: Task[]): Task[] {
  const ids = new Set(tasks.map((task) => task.id));
  const children: Task[] = [];

  const parents = tasks.map((task) => {
    for (const sub of task.subtasks ?? []) {
      if (ids.has(sub.id)) continue;
      ids.add(sub.id);
      children.push(subtaskToTask(task, sub));
    }
    return { ...task, parentId: task.parentId ?? null, subtasks: [] as Subtask[] };
  });

  return [...parents, ...children];
}

export function withSections(projects: Project[], tasks: Task[]) {
  const nextProjects = projects.map((project) => {
    const existing = project.sections ?? [];
    const fromTasks: string[] = [];
    for (const task of tasks) {
      if (task.projectId !== project.id || task.id.startsWith("hist-")) continue;
      if (!task.section || existing.includes(task.section) || fromTasks.includes(task.section)) {
        continue;
      }
      fromTasks.push(task.section);
    }
    const sections =
      existing.length > 0 || fromTasks.length > 0 ? [...existing, ...fromTasks] : ["Geral"];
    return { ...project, sections };
  });

  const maxOrder = new Map<string, number>();
  for (const task of tasks) {
    if (typeof task.order !== "number") continue;
    const key = `${task.projectId}\0${task.section}`;
    maxOrder.set(key, Math.max(maxOrder.get(key) ?? -1, task.order));
  }

  const nextTasks = tasks.map((task) => {
    if (typeof task.order === "number") return task;
    const key = `${task.projectId}\0${task.section}`;
    const order = (maxOrder.get(key) ?? -1) + 1;
    maxOrder.set(key, order);
    return { ...task, order };
  });

  return { projects: nextProjects, tasks: nextTasks };
}

function subtaskToTask(parent: Task, sub: Subtask): Task {
  return {
    id: sub.id,
    projectId: parent.projectId,
    title: sub.title,
    description: "",
    assigneeId: null,
    dueDate: sub.dueDate ?? null,
    startDate: sub.dueDate ?? null,
    priority: "media",
    status: sub.done ? "done" : "todo",
    tagIds: [],
    section: parent.section,
    parentId: parent.id,
    subtasks: [],
    comments: [],
    completedAt: null,
    createdAt: parent.createdAt,
  };
}
