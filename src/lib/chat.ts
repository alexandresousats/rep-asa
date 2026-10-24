"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { loadSession } from "./api";
import { agentReady, usePrefs } from "./prefs";
import type {
  ChatAudioAttachment,
  ChatDocumentAttachment,
  ChatFolder,
  ChatMessage,
  ChatSession,
} from "./types";

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
  documents?: ChatDocumentAttachment[];
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
  restoreSession: (id: string) => void;
  purgeSession: (id: string) => void;
  emptyTrash: () => void;
  purgeExpiredTrash: () => void;
  clearSessionMessages: (sessionId?: string) => void;

  // Mensagens
  deleteMessage: (messageId: string, sessionId?: string) => void;
  editAndResendMessage: (messageId: string, newText: string) => Promise<void>;

  // Pastas
  createFolder: (name: string, color?: string) => ChatFolder;
  renameFolder: (id: string, name: string) => void;
  setFolderColor: (id: string, color: string) => void;
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

function deriveTitle(
  text: string,
  hasImages?: boolean,
  hasAudio?: boolean,
  documents?: ChatDocumentAttachment[],
): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean) {
    return clean.length > 36 ? `${clean.slice(0, 36).trim()}…` : clean;
  }
  if (documents && documents.length > 0) return `📄 ${documents[0].name}`;
  if (hasAudio) return "Áudio enviado";
  if (hasImages) return "Imagem enviada";
  return "Nova conversa";
}

export const TRASH_RETENTION_DAYS = 30;
const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export function trashDaysRemaining(deletedAt: string, now = Date.now()) {
  const deleted = new Date(deletedAt).getTime();
  if (Number.isNaN(deleted)) return 0;
  const remaining = deleted + TRASH_RETENTION_MS - now;
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / (24 * 60 * 60 * 1000));
}

export function trashRetentionLabel(deletedAt: string, now = Date.now()) {
  const days = trashDaysRemaining(deletedAt, now);
  if (days <= 0) return "Apaga agora";
  const purge = new Date(new Date(deletedAt).getTime() + TRASH_RETENTION_MS);
  if (purge.toDateString() === new Date(now).toDateString()) return "Apaga hoje";
  if (days === 1) return "Apaga em 1 dia";
  return `Apaga em ${days} dias`;
}

function isLiveSession(session: ChatSession) {
  return !session.deletedAt;
}

function dropExpiredSessions(sessions: ChatSession[], now = Date.now()) {
  return sessions.filter((session) => {
    if (!session.deletedAt) return true;
    return trashDaysRemaining(session.deletedAt, now) > 0;
  });
}

function freshSession(folderId: string | null = null): ChatSession {
  const now = new Date().toISOString();
  return {
    id: uid("sess"),
    title: "Nova conversa",
    folderId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => {
      function activeSession(): ChatSession | undefined {
        const { sessions, activeSessionId } = get();
        return (
          sessions.find((s) => s.id === activeSessionId) ||
          sessions.find(isLiveSession) ||
          sessions[0]
        );
      }

      function syncMessages(sessions: ChatSession[], activeId: string | null) {
        const current = sessions.find((s) => s.id === activeId);
        if (current) return current.messages;
        const live = sessions.find(isLiveSession);
        return live ? live.messages : [];
      }

      function activateLive(
        sessions: ChatSession[],
        activeSessionId: string | null,
        preferNewLive: boolean,
      ) {
        const live = sessions.filter(isLiveSession);
        if (live.length === 0) {
          const fallback = freshSession();
          const next = [fallback, ...sessions];
          return {
            sessions: next,
            activeSessionId: fallback.id,
            messages: [] as ChatMessage[],
            sending: false,
          };
        }
        const keepCurrent =
          !preferNewLive && live.some((session) => session.id === activeSessionId);
        const nextActive = keepCurrent ? activeSessionId : live[0].id;
        return {
          sessions,
          activeSessionId: nextActive,
          messages: syncMessages(sessions, nextActive),
          sending: false,
        };
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

      const defaultSession = freshSession();

      async function runChatStream(
        currentSessionId: string,
        replyMessageId: string,
        history: Array<{
          role: "user" | "assistant";
          content: string;
          images?: string[];
          documents?: ChatDocumentAttachment[];
        }>,
      ) {
        const agent = usePrefs.getState().agent;
        if (!agentReady(agent)) return;

        controller = new AbortController();
        let mutated = false;

        function apply(event: StreamEvent) {
          if (event.type === "text") {
            patchAssistantInSession(currentSessionId, replyMessageId, (m) => ({
              ...m,
              content: m.content + event.delta,
            }));
          } else if (event.type === "tool") {
            patchAssistantInSession(currentSessionId, replyMessageId, (m) => ({
              ...m,
              steps: [
                ...m.steps,
                { id: event.id, name: event.name, args: event.args, status: "running" },
              ],
            }));
          } else if (event.type === "tool_result") {
            if (event.mutated) mutated = true;
            patchAssistantInSession(currentSessionId, replyMessageId, (m) => ({
              ...m,
              steps: m.steps.map((step) =>
                step.id === event.id ? { ...step, status: event.ok ? "done" : "error" } : step,
              ),
            }));
          } else if (event.type === "error") {
            patchAssistantInSession(currentSessionId, replyMessageId, (m) => ({
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
            patchAssistantInSession(currentSessionId, replyMessageId, (m) => ({
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
            patchAssistantInSession(currentSessionId, replyMessageId, (m) => ({
              ...m,
              error: "A conexão com o servidor foi interrompida.",
            }));
          }
        } finally {
          controller = null;
          patchAssistantInSession(currentSessionId, replyMessageId, (m) => ({
            ...m,
            pending: false,
            steps: m.steps.map((step) =>
              step.status === "running" ? { ...step, status: "error" } : step,
            ),
          }));
          set({ sending: false });
          if (mutated) void loadSession();
        }
      }

      return {
        folders: [],
        sessions: [defaultSession],
        activeSessionId: defaultSession.id,
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
            const target = state.sessions.find((session) => session.id === id);
            if (!target || target.deletedAt) return state;
            const sessions = state.sessions.map((session) =>
              session.id === id ? { ...session, deletedAt: new Date().toISOString() } : session,
            );
            return activateLive(sessions, state.activeSessionId, state.activeSessionId === id);
          });
        },

        restoreSession: (id) => {
          set((state) => {
            const target = state.sessions.find((session) => session.id === id);
            if (!target?.deletedAt) return state;
            const sessions = state.sessions.map((session) =>
              session.id === id
                ? { ...session, deletedAt: null, updatedAt: new Date().toISOString() }
                : session,
            );
            return {
              sessions,
              activeSessionId: id,
              messages: syncMessages(sessions, id),
            };
          });
        },

        purgeSession: (id) => {
          controller?.abort();
          controller = null;
          set((state) => {
            if (!state.sessions.some((session) => session.id === id)) return state;
            const sessions = state.sessions.filter((session) => session.id !== id);
            return activateLive(sessions, state.activeSessionId, state.activeSessionId === id);
          });
        },

        emptyTrash: () => {
          controller?.abort();
          controller = null;
          set((state) => {
            const sessions = state.sessions.filter(isLiveSession);
            if (sessions.length === state.sessions.length) return state;
            const removedActive = !sessions.some((session) => session.id === state.activeSessionId);
            return activateLive(sessions, state.activeSessionId, removedActive);
          });
        },

        purgeExpiredTrash: () => {
          const now = Date.now();
          set((state) => {
            const sessions = dropExpiredSessions(state.sessions, now);
            if (sessions.length === state.sessions.length) return state;
            const removedActive = !sessions.some((session) => session.id === state.activeSessionId);
            return activateLive(sessions, state.activeSessionId, removedActive);
          });
        },

        clearSessionMessages: (sessionId) => {
          controller?.abort();
          controller = null;
          const targetId = sessionId || get().activeSessionId;
          if (!targetId) return;
          const target = get().sessions.find((session) => session.id === targetId);
          if (!target || target.deletedAt) return;
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
          const target = get().sessions.find((session) => session.id === targetId);
          if (!target || target.deletedAt) return;
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

        setFolderColor: (id, color) => {
          const clean = color.trim();
          if (!clean) return;
          set((state) => ({
            folders: state.folders.map((f) => (f.id === id ? { ...f, color: clean } : f)),
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
          const documents = options.documents?.filter(Boolean) || [];

          if (
            (!text && images.length === 0 && !audio && documents.length === 0) ||
            get().sending
          ) {
            return;
          }
          const agent = usePrefs.getState().agent;
          if (!agentReady(agent)) return;

          let session = activeSession();
          if (!session || session.deletedAt) {
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
            documents: documents.length > 0 ? documents : undefined,
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
            ? deriveTitle(text, images.length > 0, Boolean(audio), documents)
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
            .filter(
              (m) =>
                m.content.trim() ||
                (m.images && m.images.length > 0) ||
                (m.documents && m.documents.length > 0) ||
                Boolean(m.audio),
            )
            .map((m) => ({
              role: m.role,
              content: m.content || (m.audio ? "[Mensagem de áudio enviada pelo usuário]" : ""),
              images: m.images,
              documents: m.documents,
            }));

          await runChatStream(currentSessionId, replyMessage.id, history);
        },

        editAndResendMessage: async (messageId: string, newText: string) => {
          const clean = newText.trim();
          if (!clean || get().sending) return;

          const agent = usePrefs.getState().agent;
          if (!agentReady(agent)) return;

          const session = activeSession();
          if (!session || session.deletedAt) return;
          const currentSessionId = session.id;

          const msgIndex = session.messages.findIndex((m) => m.id === messageId);
          if (msgIndex === -1) return;

          const targetMsg = session.messages[msgIndex];
          const updatedUserMessage: ChatMessage = {
            ...targetMsg,
            content: clean,
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

          const priorMessages = session.messages.slice(0, msgIndex);
          const newMessages = [...priorMessages, updatedUserMessage, replyMessage];

          const newTitle =
            msgIndex === 0
              ? deriveTitle(
                  clean,
                  Boolean(targetMsg.images?.length),
                  Boolean(targetMsg.audio),
                  targetMsg.documents,
                )
              : session.title;

          set((state) => {
            const sessions = state.sessions.map((s) => {
              if (s.id !== currentSessionId) return s;
              return {
                ...s,
                title: newTitle,
                messages: newMessages,
                updatedAt: new Date().toISOString(),
              };
            });
            return {
              sessions,
              messages: syncMessages(sessions, state.activeSessionId),
              sending: true,
            };
          });

          const fullMessages = [...priorMessages, updatedUserMessage];
          const history = fullMessages
            .filter(
              (m) =>
                m.content.trim() ||
                (m.images && m.images.length > 0) ||
                (m.documents && m.documents.length > 0),
            )
            .map((m) => ({
              role: m.role,
              content: m.content,
              images: m.images,
              documents: m.documents,
            }));

          await runChatStream(currentSessionId, replyMessage.id, history);
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
        state.sessions = dropExpiredSessions(state.sessions || []);
        const live = state.sessions.filter(isLiveSession);
        if (live.length === 0) {
          const fallback = freshSession();
          state.sessions = [fallback, ...state.sessions];
          state.activeSessionId = fallback.id;
          state.messages = [];
          return;
        }
        const active =
          live.find((session) => session.id === state.activeSessionId) || live[0];
        state.activeSessionId = active.id;
        state.messages = active.messages || [];
      },
    },
  ),
);
