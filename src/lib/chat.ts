"use client";

import { create } from "zustand";
import { loadSession } from "./api";
import { agentReady, usePrefs } from "./prefs";
import type { ChatMessage } from "./types";

type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; ok: boolean; mutated: boolean }
  | { type: "error"; message: string }
  | { type: "done" };

interface ChatState {
  messages: ChatMessage[];
  sending: boolean;
  send: (text: string) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

let controller: AbortController | null = null;

function uid(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export const useChat = create<ChatState>((set, get) => {
  function patchAssistant(id: string, patch: (message: ChatMessage) => ChatMessage) {
    set((state) => ({
      messages: state.messages.map((message) => (message.id === id ? patch(message) : message)),
    }));
  }

  return {
    messages: [],
    sending: false,
    reset: () => {
      controller?.abort();
      controller = null;
      set({ messages: [], sending: false });
    },
    stop: () => controller?.abort(),
    send: async (text) => {
      const value = text.trim();
      if (!value || get().sending) return;
      const agent = usePrefs.getState().agent;
      if (!agentReady(agent)) return;

      const user: ChatMessage = { id: uid("u"), role: "user", content: value, steps: [] };
      const reply: ChatMessage = {
        id: uid("a"),
        role: "assistant",
        content: "",
        steps: [],
        pending: true,
      };
      const history = [...get().messages, user]
        .filter((message) => message.content.trim())
        .map((message) => ({ role: message.role, content: message.content }));

      set((state) => ({ messages: [...state.messages, user, reply], sending: true }));
      controller = new AbortController();
      let mutated = false;

      function apply(event: StreamEvent) {
        if (event.type === "text") {
          patchAssistant(reply.id, (m) => ({ ...m, content: m.content + event.delta }));
        } else if (event.type === "tool") {
          patchAssistant(reply.id, (m) => ({
            ...m,
            steps: [
              ...m.steps,
              { id: event.id, name: event.name, args: event.args, status: "running" },
            ],
          }));
        } else if (event.type === "tool_result") {
          if (event.mutated) mutated = true;
          patchAssistant(reply.id, (m) => ({
            ...m,
            steps: m.steps.map((step) =>
              step.id === event.id ? { ...step, status: event.ok ? "done" : "error" } : step,
            ),
          }));
        } else if (event.type === "error") {
          patchAssistant(reply.id, (m) => ({ ...m, error: event.message }));
        }
      }

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            agent: { baseUrl: agent.baseUrl, apiKey: agent.apiKey, model: agent.model },
            messages: history,
          }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          let message = "Não foi possível falar com o agente.";
          try {
            const data = (await response.json()) as { error?: string };
            if (data.error) message = data.error;
          } catch {
            // Mantém a mensagem padrão.
          }
          patchAssistant(reply.id, (m) => ({ ...m, error: message }));
        } else {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value: chunk } = await reader.read();
            if (done) break;
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                apply(JSON.parse(line) as StreamEvent);
              } catch {
                // Linha incompleta ou inválida: ignora.
              }
            }
          }
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          patchAssistant(reply.id, (m) => ({
            ...m,
            error: "A conexão com o servidor foi interrompida.",
          }));
        }
      } finally {
        controller = null;
        patchAssistant(reply.id, (m) => ({
          ...m,
          pending: false,
          steps: m.steps.map((step) =>
            step.status === "running" ? { ...step, status: "error" } : step,
          ),
        }));
        set({ sending: false });
        if (mutated) void loadSession();
      }
    },
  };
});
