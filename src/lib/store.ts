"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  SEED_MESSAGES,
  SEED_PROJECTS,
  SEED_TAGS,
  SEED_TASKS,
  SEED_THREADS,
  SEED_USERS,
} from "./mock/seed";
import type {
  Message,
  MessageThread,
  Priority,
  Project,
  Tag,
  Task,
  TaskStatus,
  User,
} from "./types";

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export interface AppState {
  hasHydrated: boolean;
  currentUserId: string | null;
  users: User[];
  projects: Project[];
  tasks: Task[];
  tags: Tag[];
  threads: MessageThread[];
  messages: Message[];
  resetTokens: Record<string, string>;
  setHasHydrated: (value: boolean) => void;
  login: (email: string, password: string) => { ok: true } | { ok: false; error: string };
  signup: (input: {
    name: string;
    email: string;
    password: string;
  }) => { ok: true } | { ok: false; error: string };
  logout: () => void;
  requestReset: (email: string) => { ok: true; token: string } | { ok: false; error: string };
  confirmReset: (
    token: string,
    password: string,
  ) => { ok: true } | { ok: false; error: string };
  createProject: (input: {
    name: string;
    description: string;
    color: string;
  }) => Project;
  createTask: (input: {
    projectId: string;
    title: string;
    description?: string;
    assigneeId?: string | null;
    dueDate?: string | null;
    startDate?: string | null;
    priority?: Priority;
    tagIds?: string[];
    section?: string;
  }) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  setTaskStatus: (id: string, status: TaskStatus) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  addComment: (taskId: string, body: string) => void;
  createTag: (name: string, color: string) => Tag;
  updateTag: (id: string, patch: Partial<Pick<Tag, "name" | "color">>) => void;
  deleteTag: (id: string) => void;
  sendMessage: (threadId: string, body: string) => Message;
  createThread: (title: string, participantIds: string[], projectId?: string | null) => MessageThread;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      currentUserId: null,
      users: SEED_USERS,
      projects: SEED_PROJECTS,
      tasks: SEED_TASKS,
      tags: SEED_TAGS,
      threads: SEED_THREADS,
      messages: SEED_MESSAGES,
      resetTokens: {},
      setHasHydrated: (value) => set({ hasHydrated: value }),
      login: (email, password) => {
        const user = get().users.find(
          (item) =>
            item.email.toLowerCase() === email.trim().toLowerCase() &&
            item.password === password,
        );
        if (!user) return { ok: false, error: "E-mail ou senha inválidos." };
        set({ currentUserId: user.id });
        return { ok: true };
      },
      signup: ({ name, email, password }) => {
        const exists = get().users.some(
          (item) => item.email.toLowerCase() === email.trim().toLowerCase(),
        );
        if (exists) return { ok: false, error: "Este e-mail já está em uso." };
        const user: User = {
          id: uid("u"),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          initials: name
            .split(" ")
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join(""),
          role: "Membro",
        };
        set((state) => ({
          users: [...state.users, user],
          currentUserId: user.id,
        }));
        return { ok: true };
      },
      logout: () => set({ currentUserId: null }),
      requestReset: (email) => {
        const user = get().users.find(
          (item) => item.email.toLowerCase() === email.trim().toLowerCase(),
        );
        if (!user) return { ok: false, error: "Não encontramos uma conta com este e-mail." };
        const token = uid("rst");
        set((state) => ({
          resetTokens: { ...state.resetTokens, [token]: user.id },
        }));
        return { ok: true, token };
      },
      confirmReset: (token, password) => {
        const userId = get().resetTokens[token];
        if (!userId) return { ok: false, error: "Link inválido ou expirado." };
        set((state) => ({
          users: state.users.map((user) =>
            user.id === userId ? { ...user, password } : user,
          ),
          resetTokens: Object.fromEntries(
            Object.entries(state.resetTokens).filter(([key]) => key !== token),
          ),
        }));
        return { ok: true };
      },
      createProject: ({ name, description, color }) => {
        const currentUserId = get().currentUserId;
        const project: Project = {
          id: uid("p"),
          name: name.trim(),
          description: description.trim(),
          color,
          memberIds: currentUserId ? [currentUserId] : [],
          createdAt: new Date().toISOString().slice(0, 10),
        };
        set((state) => ({ projects: [project, ...state.projects] }));
        return project;
      },
      createTask: (input) => {
        const task: Task = {
          id: uid("task"),
          projectId: input.projectId,
          title: input.title.trim(),
          description: input.description?.trim() ?? "",
          assigneeId: input.assigneeId ?? get().currentUserId,
          dueDate: input.dueDate ?? null,
          startDate: input.startDate ?? input.dueDate ?? null,
          priority: input.priority ?? "media",
          status: "todo",
          tagIds: input.tagIds ?? [],
          section: input.section ?? "Geral",
          subtasks: [],
          comments: [],
          completedAt: null,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ tasks: [task, ...state.tasks] }));
        return task;
      },
      updateTask: (id, patch) => {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, ...patch, id: task.id } : task,
          ),
        }));
      },
      setTaskStatus: (id, status) => {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id
              ? {
                  ...task,
                  status,
                  completedAt:
                    status === "done"
                      ? new Date().toISOString().slice(0, 10)
                      : null,
                }
              : task,
          ),
        }));
      },
      addSubtask: (taskId, title) => {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  subtasks: [
                    ...task.subtasks,
                    { id: uid("st"), title: title.trim(), done: false },
                  ],
                }
              : task,
          ),
        }));
      },
      toggleSubtask: (taskId, subtaskId) => {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  subtasks: task.subtasks.map((subtask) =>
                    subtask.id === subtaskId
                      ? { ...subtask, done: !subtask.done }
                      : subtask,
                  ),
                }
              : task,
          ),
        }));
      },
      addComment: (taskId, body) => {
        const authorId = get().currentUserId;
        if (!authorId) return;
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  comments: [
                    ...task.comments,
                    {
                      id: uid("c"),
                      authorId,
                      body: body.trim(),
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }
              : task,
          ),
        }));
      },
      createTag: (name, color) => {
        const tag: Tag = { id: uid("t"), name: name.trim().toLowerCase(), color };
        set((state) => ({ tags: [...state.tags, tag] }));
        return tag;
      },
      updateTag: (id, patch) => {
        set((state) => ({
          tags: state.tags.map((tag) => (tag.id === id ? { ...tag, ...patch } : tag)),
        }));
      },
      deleteTag: (id) => {
        set((state) => ({
          tags: state.tags.filter((tag) => tag.id !== id),
          tasks: state.tasks.map((task) => ({
            ...task,
            tagIds: task.tagIds.filter((tagId) => tagId !== id),
          })),
        }));
      },
      sendMessage: (threadId, body) => {
        const authorId = get().currentUserId;
        if (!authorId) {
          throw new Error("Sessão inválida.");
        }
        const message: Message = {
          id: uid("m"),
          threadId,
          authorId,
          body: body.trim(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          messages: [...state.messages, message],
          threads: state.threads.map((thread) =>
            thread.id === threadId
              ? { ...thread, lastMessageAt: message.createdAt }
              : thread,
          ),
        }));
        return message;
      },
      createThread: (title, participantIds, projectId = null) => {
        const currentUserId = get().currentUserId;
        const thread: MessageThread = {
          id: uid("th"),
          title: title.trim(),
          projectId,
          participantIds: Array.from(
            new Set([...(currentUserId ? [currentUserId] : []), ...participantIds]),
          ),
          lastMessageAt: new Date().toISOString(),
        };
        set((state) => ({ threads: [thread, ...state.threads] }));
        return thread;
      },
    }),
    {
      name: "asa-store",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
