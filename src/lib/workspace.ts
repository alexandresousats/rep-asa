"use client";

import { create } from "zustand";
import type {
  AppNotification,
  Message,
  MessageThread,
  Project,
  Tag,
  Task,
  User,
  WorkspaceInfo,
  WorkspaceInvite,
  WorkspaceMembership,
} from "./types";

export interface WorkspaceData {
  user: User | null;
  workspace: WorkspaceInfo | null;
  workspaces: WorkspaceMembership[];
  invites: WorkspaceInvite[];
  users: User[];
  projects: Project[];
  tasks: Task[];
  tags: Tag[];
  threads: MessageThread[];
  messages: Message[];
  notifications: AppNotification[];
}

interface WorkspaceState extends WorkspaceData {
  ready: boolean;
  hydrate: (data: WorkspaceData & { user: User }) => void;
  clear: () => void;
  fail: () => void;
  upsertUser: (user: User) => void;
  upsertProject: (project: Project) => void;
  upsertTask: (task: Task) => void;
  upsertTag: (tag: Tag) => void;
  removeTag: (id: string) => void;
  upsertThread: (thread: MessageThread) => void;
  upsertMessage: (message: Message) => void;
  setNotifications: (notifications: AppNotification[]) => void;
}

const empty: WorkspaceData = {
  user: null,
  workspace: null,
  workspaces: [],
  invites: [],
  users: [],
  projects: [],
  tasks: [],
  tags: [],
  threads: [],
  messages: [],
  notifications: [],
};

export const useWorkspace = create<WorkspaceState>((set) => ({
  ready: false,
  ...empty,
  hydrate: (data) => set({ ready: true, ...data }),
  clear: () => set({ ready: true, ...empty }),
  fail: () => set({ ready: true, ...empty }),
  upsertUser: (user) =>
    set((state) => ({
      user: state.user?.id === user.id ? user : state.user,
      users: state.users.some((item) => item.id === user.id)
        ? state.users.map((item) => (item.id === user.id ? user : item))
        : [...state.users, user].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    })),
  upsertProject: (project) =>
    set((state) => ({
      projects: state.projects.some((item) => item.id === project.id)
        ? state.projects.map((item) => (item.id === project.id ? project : item))
        : [project, ...state.projects],
    })),
  upsertTask: (task) =>
    set((state) => ({
      tasks: state.tasks.some((item) => item.id === task.id)
        ? state.tasks.map((item) => (item.id === task.id ? task : item))
        : [task, ...state.tasks],
    })),
  upsertTag: (tag) =>
    set((state) => ({
      tags: state.tags.some((item) => item.id === tag.id)
        ? state.tags.map((item) => (item.id === tag.id ? tag : item))
        : [...state.tags, tag],
    })),
  removeTag: (id) =>
    set((state) => ({
      tags: state.tags.filter((tag) => tag.id !== id),
      tasks: state.tasks.map((task) => ({
        ...task,
        tagIds: task.tagIds.filter((tagId) => tagId !== id),
      })),
    })),
  upsertThread: (thread) =>
    set((state) => ({
      threads: state.threads.some((item) => item.id === thread.id)
        ? state.threads.map((item) => (item.id === thread.id ? thread : item))
        : [thread, ...state.threads],
    })),
  upsertMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
      threads: state.threads.map((thread) =>
        thread.id === message.threadId
          ? { ...thread, lastMessageAt: message.createdAt }
          : thread,
      ),
    })),
  setNotifications: (notifications) => set({ notifications }),
}));

export function useAccess() {
  const user = useWorkspace((state) => state.user);
  return {
    user,
    isAdmin: user?.access === "admin",
    canWrite: user?.access === "admin" || user?.access === "editor",
  };
}
