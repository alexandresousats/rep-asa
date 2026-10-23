"use client";

import {
  Folder as FolderIcon,
  PanelLeft,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AgentSidebar } from "@/components/chat/agent-sidebar";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatThread } from "@/components/chat/chat-thread";
import { useChat } from "@/lib/chat";
import { agentReady, usePrefs } from "@/lib/prefs";
import { useWorkspace } from "@/lib/workspace";

const SUGGESTIONS = [
  "Criar uma tarefa urgente para amanhã",
  "Quais tarefas estão atrasadas na equipe?",
  "O que vence nos próximos 7 dias?",
  "Listar os projetos do meu espaço",
];

export default function AgentPage() {
  const user = useWorkspace((state) => state.user);
  const agent = usePrefs((state) => state.agent);
  const ready = agentReady(agent);

  const sessions = useChat((state) => state.sessions);
  const activeSessionId = useChat((state) => state.activeSessionId);
  const folders = useChat((state) => state.folders);
  const createSession = useChat((state) => state.createSession);
  const deleteSession = useChat((state) => state.deleteSession);
  const renameSession = useChat((state) => state.renameSession);
  const clearSessionMessages = useChat((state) => state.clearSessionMessages);
  const send = useChat((state) => state.send);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const activeFolder = folders.find((f) => f.id === activeSession?.folderId);
  const messages = activeSession?.messages || [];
  const firstName = user?.name.split(" ")[0] ?? "equipe";

  function handleStartRename() {
    if (!activeSession) return;
    setTitleValue(activeSession.title);
    setIsEditingTitle(true);
  }

  function handleSaveRename() {
    if (activeSession && titleValue.trim()) {
      renameSession(activeSession.id, titleValue.trim());
    }
    setIsEditingTitle(false);
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-base text-ink">
      {/* Sidebar Desktop */}
      <AgentSidebar open={sidebarOpen} />

      {/* Sidebar Mobile Drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative z-10 h-full">
            <AgentSidebar
              open
              onClose={() => setMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Área Principal de Conversa */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Barra Superior */}
        <header className="flex h-[68px] shrink-0 items-center justify-between px-3 py-4">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileSidebarOpen(true);
                } else {
                  setSidebarOpen((prev) => !prev);
                }
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink transition-colors"
              title="Alternar barra de conversas e pastas"
              aria-label="Alternar barra lateral"
            >
              <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
            </button>

            {isEditingTitle ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRename();
                    if (e.key === "Escape") setIsEditingTitle(false);
                  }}
                  className="h-8 rounded-lg bg-elevated px-2.5 text-sm font-medium text-ink outline-none ring-1 ring-ink/10 focus:ring-ink/30"
                />
                <button
                  type="button"
                  onClick={handleSaveRename}
                  className="rounded-lg bg-ink px-2.5 py-1 text-xs text-base font-medium"
                >
                  Salvar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 truncate">
                <button
                  type="button"
                  onClick={handleStartRename}
                  className="group flex h-9 items-center gap-1.5 truncate text-left text-sm font-medium text-ink hover:opacity-80"
                  title="Clique para renomear"
                >
                  <span className="truncate">{activeSession?.title || "Nova conversa"}</span>
                  <Pencil className="h-3 w-3 text-faint opacity-0 transition-opacity group-hover:opacity-100 shrink-0" strokeWidth={1.5} />
                </button>

                {activeFolder && (
                  <span className="hidden items-center gap-1 rounded-full bg-elevated px-2.5 py-0.5 text-[11px] text-faint sm:flex shrink-0">
                    <FolderIcon className="h-3 w-3" style={{ color: activeFolder.color }} strokeWidth={1.5} />
                    <span className="truncate max-w-[120px]">{activeFolder.name}</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Ações da Barra Superior */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => createSession(activeSession?.folderId)}
              className="hidden h-9 items-center gap-1.5 rounded-full bg-elevated px-3 text-xs text-muted hover:bg-hover hover:text-ink sm:flex transition-colors"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Novo chat</span>
            </button>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm("Limpar todas as mensagens desta conversa?")) {
                    clearSessionMessages(activeSession?.id);
                  }
                }}
                title="Limpar mensagens desta conversa"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-faint hover:bg-hover hover:text-ink transition-colors"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </button>
            )}

            <Link
              href="/configuracoes?tab=agente"
              title="Configurações do Agente de IA"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-faint hover:bg-hover hover:text-ink transition-colors"
            >
              <Settings className="h-4 w-4" strokeWidth={1.5} />
            </Link>
          </div>
        </header>

        {/* Conteúdo Central */}
        <div data-chat-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {messages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center">
              <h1 className="text-xl sm:text-[22px] font-semibold tracking-tight text-ink text-center mb-6">
                O que devemos explorar?
              </h1>

              <ChatComposer
                autoFocus
                hero
                className="w-full"
              />

              {ready ? (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2 max-w-xl">
                  {SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => void send(sug)}
                      className="rounded-full bg-elevated/70 px-4 py-2 text-xs text-muted hover:bg-hover hover:text-ink transition-all"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-500 text-center">
                  <p className="font-medium">Agente não conectado</p>
                  <p className="mt-1 text-amber-500/80">
                    Adicione sua chave de API nas configurações para começar a conversar.
                  </p>
                  <Link
                    href="/configuracoes?tab=agente"
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs text-base font-medium"
                  >
                    Configurar agora
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <ChatThread messages={messages} className="mx-auto w-full max-w-3xl" />
          )}
        </div>

        {/* Rodapé com Composer (exibido apenas quando já existem mensagens na conversa) */}
        {messages.length > 0 && (
          <div className="shrink-0 bg-base/80 p-4 backdrop-blur-xs">
            <ChatComposer
              autoFocus
              className="mx-auto w-full max-w-3xl"
            />
          </div>
        )}
      </div>
    </div>
  );
}
