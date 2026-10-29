"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AgentSettings,
  McpServer,
  McpTransport,
  ProjectsLayout,
  TaskViewMode,
} from "./types";

export const AGENT_PRESETS = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  xai: { label: "Grok (xAI)", baseUrl: "https://api.x.ai/v1", model: "grok-4" },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
  },
  custom: { label: "Outra API", baseUrl: "", model: "" },
} as const;

export const EMPTY_AGENT: AgentSettings = {
  preset: "openai",
  baseUrl: AGENT_PRESETS.openai.baseUrl,
  model: AGENT_PRESETS.openai.model,
  apiKey: "",
};

export function agentReady(agent: AgentSettings) {
  return Boolean(agent.baseUrl.trim() && agent.model.trim() && agent.apiKey.trim());
}

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
  agent: AgentSettings;
  /** Dono das chaves de IA e MCP guardadas neste navegador. */
  ownerId: string | null;
  claimFor: (userId: string) => void;
  setAgent: (patch: Partial<AgentSettings>) => void;
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
      agent: EMPTY_AGENT,
      ownerId: null,
      // Outra pessoa entrou neste navegador: as chaves de quem estava antes não passam para ela.
      claimFor: (userId) => {
        const { ownerId } = get();
        if (ownerId === userId) return;
        set(
          ownerId
            ? { ownerId: userId, agent: EMPTY_AGENT, mcpServers: [] }
            : { ownerId: userId },
        );
      },
      setAgent: (patch) => set({ agent: { ...get().agent, ...patch } }),
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
        agent: state.agent,
        ownerId: state.ownerId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
