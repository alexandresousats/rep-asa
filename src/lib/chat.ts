"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { loadSession } from "./api";
import { agentReady, usePrefs } from "./prefs";
import type { ChatAudioAttachment, ChatFolder, ChatMessage, ChatSession } from "./types";

type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; ok: boolean; mutated: boolean }
  | { type: "error"; message: string }
  | { type: "done" };

export interface SendOptions {
  text: string;
  images?: string[];
  audio?: ChatAudioAttachment;
}

interface ChatState {
  folders: ChatFolder[];
  sessions: ChatSession[];
  activeSessionId: string | null;
  sending: boolean;

  // Compatibilidade com componentes que leem messages direto
  messages: ChatMessage[];

  // Sessões
  createSession: (folderId?: string | null) => string;
  selectSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  moveSessionToFolder: (sessionId: string, folderId: string | null) => void;
  deleteSession: (id: string) => void;
  clearSessionMessages: (sessionId?: string) => void;

  // Mensagens
  deleteMessage: (messageId: string, sessionId?: string) => void;

  // Pastas
  createFolder: (name: string, color?: string) => ChatFolder;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;

  // Ações de envio
  send: (input: string | SendOptions) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

let controller: AbortController | null = null;

function uid(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function deriveTitle(text: string, hasImages?: boolean, hasAudio?: boolean): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean) {
    return clean.length > 36 ? `${clean.slice(0, 36).trim()}…` : clean;
  }
  if (hasAudio) return "Áudio enviado";
  if (hasImages) return "Imagem enviada";
  return "Nova conversa";
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => {
      function activeSession(): ChatSession | undefined {
        const { sessions, activeSessionId } = get();
        return sessions.find((s) => s.id === activeSessionId) || sessions[0];
      }

      function syncMessages(sessions: ChatSession[], activeId: string | null) {
        const current = sessions.find((s) => s.id === activeId) || sessions[0];
        return current ? current.messages : [];
      }

      function patchAssistantInSession(
        sessionId: string,
        replyId: string,
        patch: (message: ChatMessage) => ChatMessage,
      ) {
        set((state) => {
          const sessions = state.sessions.map((session) => {
            if (session.id !== sessionId) return session;
            return {
              ...session,
              messages: session.messages.map((m) => (m.id === replyId ? patch(m) : m)),
              updatedAt: new Date().toISOString(),
            };
          });
          return {
            sessions,
            messages: syncMessages(sessions, state.activeSessionId),
          };
        });
      }

      const initialSessionId = uid("sess");
      const defaultSession: ChatSession = {
        id: initialSessionId,
        title: "Nova conversa",
        folderId: null,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return {
        folders: [],
        sessions: [defaultSession],
        activeSessionId: initialSessionId,
        messages: [],
        sending: false,

        createSession: (folderId = null) => {
          controller?.abort();
          controller = null;
          const newId = uid("sess");
          const session: ChatSession = {
            id: newId,
            title: "Nova conversa",
            folderId,
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          set((state) => ({
            sessions: [session, ...state.sessions],
            activeSessionId: newId,
            messages: [],
            sending: false,
          }));
          return newId;
        },

        selectSession: (id) => {
          controller?.abort();
          controller = null;
          set((state) => {
            const current = state.sessions.find((s) => s.id === id);
            return {
              activeSessionId: id,
              messages: current ? current.messages : [],
              sending: false,
            };
          });
        },

        renameSession: (id, title) => {
          const clean = title.trim();
          if (!clean) return;
          set((state) => ({
            sessions: state.sessions.map((s) => (s.id === id ? { ...s, title: clean } : s)),
          }));
        },

        moveSessionToFolder: (sessionId, folderId) => {
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sessionId ? { ...s, folderId, updatedAt: new Date().toISOString() } : s,
            ),
          }));
        },

        deleteSession: (id) => {
          controller?.abort();
          controller = null;
          set((state) => {
            const nextSessions = state.sessions.filter((s) => s.id !== id);
            if (nextSessions.length === 0) {
              const fallback: ChatSession = {
                id: uid("sess"),
                title: "Nova conversa",
                folderId: null,
                messages: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              return {
                sessions: [fallback],
                activeSessionId: fallback.id,
                messages: [],
                sending: false,
              };
            }
            const nextActiveId =
              state.activeSessionId === id ? nextSessions[0].id : state.activeSessionId;
            return {
              sessions: nextSessions,
              activeSessionId: nextActiveId,
              messages: syncMessages(nextSessions, nextActiveId),
              sending: false,
            };
          });
        },

        clearSessionMessages: (sessionId) => {
          controller?.abort();
          controller = null;
          const targetId = sessionId || get().activeSessionId;
          if (!targetId) return;
          set((state) => {
            const sessions = state.sessions.map((s) =>
              s.id === targetId ? { ...s, messages: [], updatedAt: new Date().toISOString() } : s,
            );
            return {
              sessions,
              messages: syncMessages(sessions, state.activeSessionId),
              sending: false,
            };
          });
        },

        deleteMessage: (messageId, sessionId) => {
          const targetId = sessionId || get().activeSessionId;
          if (!targetId) return;
          set((state) => {
            const sessions = state.sessions.map((session) => {
              if (session.id !== targetId) return session;
              return {
                ...session,
                messages: session.messages.filter((m) => m.id !== messageId),
                updatedAt: new Date().toISOString(),
              };
            });
            return {
              sessions,
              messages: syncMessages(sessions, state.activeSessionId),
            };
          });
        },

        createFolder: (name, color) => {
          const folder: ChatFolder = {
            id: uid("fld"),
            name: name.trim() || "Nova pasta",
            color: color || "#6366f1",
            createdAt: new Date().toISOString(),
          };
          set((state) => ({ folders: [...state.folders, folder] }));
          return folder;
        },

        renameFolder: (id, name) => {
          const clean = name.trim();
          if (!clean) return;
          set((state) => ({
            folders: state.folders.map((f) => (f.id === id ? { ...f, name: clean } : f)),
          }));
        },

        deleteFolder: (id) => {
          set((state) => ({
            folders: state.folders.filter((f) => f.id !== id),
            sessions: state.sessions.map((s) => (s.folderId === id ? { ...s, folderId: null } : s)),
          }));
        },

        reset: () => {
          get().createSession();
        },

        stop: () => controller?.abort(),

        send: async (input) => {
          const options: SendOptions =
            typeof input === "string" ? { text: input } : input;
          const text = options.text.trim();
          const images = options.images?.filter(Boolean) || [];
          const audio = options.audio;

          if ((!text && images.length === 0 && !audio) || get().sending) return;
          const agent = usePrefs.getState().agent;
          if (!agentReady(agent)) return;

          let session = activeSession();
          if (!session) {
            const id = get().createSession();
            session = get().sessions.find((s) => s.id === id)!;
          }
          const currentSessionId = session.id;

          const userMessage: ChatMessage = {
            id: uid("u"),
            role: "user",
            content: text,
            images: images.length > 0 ? images : undefined,
            audio: audio || undefined,
            steps: [],
            createdAt: new Date().toISOString(),
          };

          const replyMessage: ChatMessage = {
            id: uid("a"),
            role: "assistant",
            content: "",
            steps: [],
            pending: true,
            createdAt: new Date().toISOString(),
          };

          const isFirstMessage = session.messages.length === 0;
          const newTitle = isFirstMessage
            ? deriveTitle(text, images.length > 0, Boolean(audio))
            : session.title;

          set((state) => {
            const sessions = state.sessions.map((s) => {
              if (s.id !== currentSessionId) return s;
              return {
                ...s,
                title: newTitle,
                messages: [...s.messages, userMessage, replyMessage],
                updatedAt: new Date().toISOString(),
              };
            });
            return {
              sessions,
              messages: syncMessages(sessions, state.activeSessionId),
              sending: true,
            };
          });

          // Histórico para envio ao backend
          const fullMessages = [...session.messages, userMessage];
          const history = fullMessages
            .filter((m) => m.content.trim() || (m.images && m.images.length > 0))
            .map((m) => ({
              role: m.role,
              content: m.content,
              images: m.images,
            }));

          controller = new AbortController();
          let mutated = false;

          function apply(event: StreamEvent) {
            if (event.type === "text") {
              patchAssistantInSession(currentSessionId, replyMessage.id, (m) => ({
                ...m,
                content: m.content + event.delta,
              }));
            } else if (event.type === "tool") {
              patchAssistantInSession(currentSessionId, replyMessage.id, (m) => ({
                ...m,
                steps: [
                  ...m.steps,
                  { id: event.id, name: event.name, args: event.args, status: "running" },
                ],
              }));
            } else if (event.type === "tool_result") {
              if (event.mutated) mutated = true;
              patchAssistantInSession(currentSessionId, replyMessage.id, (m) => ({
                ...m,
                steps: m.steps.map((step) =>
                  step.id === event.id ? { ...step, status: event.ok ? "done" : "error" } : step,
                ),
              }));
            } else if (event.type === "error") {
              patchAssistantInSession(currentSessionId, replyMessage.id, (m) => ({
                ...m,
                error: event.message,
              }));
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
                // mantém padrão
              }
              patchAssistantInSession(currentSessionId, replyMessage.id, (m) => ({
                ...m,
                error: message,
              }));
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
                    // linha incompleta
                  }
                }
              }
            }
          } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError")) {
              patchAssistantInSession(currentSessionId, replyMessage.id, (m) => ({
                ...m,
                error: "A conexão com o servidor foi interrompida.",
              }));
            }
          } finally {
            controller = null;
            patchAssistantInSession(currentSessionId, replyMessage.id, (m) => ({
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
    },
    {
      name: "asa-agent-sessions",
      partialize: (state) => ({
        folders: state.folders,
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.sessions || state.sessions.length === 0) {
          const id = uid("sess");
          state.sessions = [
            {
              id,
              title: "Nova conversa",
              folderId: null,
              messages: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ];
          state.activeSessionId = id;
          state.messages = [];
        } else {
          const active =
            state.sessions.find((s) => s.id === state.activeSessionId) || state.sessions[0];
          state.activeSessionId = active.id;
          state.messages = active.messages || [];
        }
      },
    },
  ),
);
