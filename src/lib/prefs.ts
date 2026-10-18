"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { McpServer, McpTransport, ProjectsLayout, TaskViewMode } from "./types";

function uid(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex}`;
}

interface PrefsState {
  hasHydrated: boolean;
  taskView: TaskViewMode;
  projectsLayout: ProjectsLayout;
  mcpServers: McpServer[];
  setHasHydrated: (value: boolean) => void;
  setTaskView: (view: TaskViewMode) => void;
  setProjectsLayout: (layout: ProjectsLayout) => void;
  createMcpServer: (input: {
    name: string;
    url: string;
    transport: McpTransport;
    apiKey?: string;
  }) => McpServer;
  updateMcpServer: (id: string, patch: Partial<Omit<McpServer, "id">>) => void;
  deleteMcpServer: (id: string) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      taskView: "sidebar",
      projectsLayout: "grid",
      mcpServers: [],
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setTaskView: (view) => set({ taskView: view }),
      setProjectsLayout: (layout) => set({ projectsLayout: layout }),
      createMcpServer: ({ name, url, transport, apiKey }) => {
        const server: McpServer = {
          id: uid("mcp"),
          name: name.trim(),
          url: url.trim(),
          transport,
          apiKey: apiKey?.trim() ?? "",
          enabled: true,
        };
        set({ mcpServers: [...get().mcpServers, server] });
        return server;
      },
      updateMcpServer: (id, patch) => {
        set({
          mcpServers: get().mcpServers.map((server) =>
            server.id === id ? { ...server, ...patch, id: server.id } : server,
          ),
        });
      },
      deleteMcpServer: (id) => {
        set({ mcpServers: get().mcpServers.filter((server) => server.id !== id) });
      },
    }),
    {
      name: "asa-prefs",
      partialize: (state) => ({
        taskView: state.taskView,
        projectsLayout: state.projectsLayout,
        mcpServers: state.mcpServers,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
