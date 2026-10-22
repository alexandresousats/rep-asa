"use client";

import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  FolderPlus,
  MessageSquare,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useChat } from "@/lib/chat";
import type { ChatFolder, ChatSession } from "@/lib/types";

export function AgentSidebar({
  open = true,
  onClose,
}: {
  open?: boolean;
  onClose?: () => void;
}) {
  const folders = useChat((state) => state.folders);
  const sessions = useChat((state) => state.sessions);
  const activeSessionId = useChat((state) => state.activeSessionId);
  const createSession = useChat((state) => state.createSession);
  const selectSession = useChat((state) => state.selectSession);
  const renameSession = useChat((state) => state.renameSession);
  const moveSessionToFolder = useChat((state) => state.moveSessionToFolder);
  const deleteSession = useChat((state) => state.deleteSession);
  const createFolder = useChat((state) => state.createFolder);
  const renameFolder = useChat((state) => state.renameFolder);
  const deleteFolder = useChat((state) => state.deleteFolder);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");

  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [foldersExpanded, setFoldersExpanded] = useState(true);

  function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    createFolder(newFolderName.trim());
    setNewFolderName("");
    setIsCreatingFolder(false);
  }

  function handleSaveRenameSession(id: string) {
    if (editingTitle.trim()) {
      renameSession(id, editingTitle.trim());
    }
    setEditingSessionId(null);
  }

  function handleSaveRenameFolder(id: string) {
    if (editingFolderName.trim()) {
      renameFolder(id, editingFolderName.trim());
    }
    setEditingFolderId(null);
  }

  // Filtra as conversas caso uma pasta específica esteja selecionada
  const filteredSessions = selectedFolderId
    ? sessions.filter((s) => s.folderId === selectedFolderId)
    : sessions;

  // Agrupamento temporal
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups: { label: string; items: ChatSession[] }[] = [
    { label: "Hoje", items: [] },
    { label: "Ontem", items: [] },
    { label: "Últimos 7 dias", items: [] },
    { label: "Anteriores", items: [] },
  ];

  filteredSessions.forEach((s) => {
    const d = new Date(s.updatedAt || s.createdAt);
    if (d.toDateString() === todayStr) {
      groups[0].items.push(s);
    } else if (d.toDateString() === yesterdayStr) {
      groups[1].items.push(s);
    } else if (d > oneWeekAgo) {
      groups[2].items.push(s);
    } else {
      groups[3].items.push(s);
    }
  });

  return (
    <aside
      className={cn(
        "flex h-full w-[280px] shrink-0 flex-col border-r border-line bg-elevated/70 backdrop-blur-xs transition-[width,transform] duration-200 ease-in-out",
        !open && "hidden md:flex md:w-0 md:border-r-0 md:overflow-hidden",
      )}
    >
      {/* Topo do Sidebar: Novo Chat e Fechar Mobile */}
      <div className="flex items-center justify-between gap-2 p-3 pb-2 border-b border-line-subtle">
        <button
          type="button"
          onClick={() => {
            const id = createSession(selectedFolderId);
            selectSession(id);
            onClose?.();
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-xs font-medium text-base hover:opacity-90 transition-opacity shadow-xs"
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} />
          <span>Nova conversa</span>
        </button>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-faint hover:bg-hover hover:text-ink md:hidden"
            aria-label="Fechar painel"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
        {/* Seção de Pastas */}
        <div>
          <div className="mb-1 flex items-center justify-between px-2 text-[11px] font-medium uppercase tracking-wider text-faint">
            <button
              type="button"
              onClick={() => setFoldersExpanded((prev) => !prev)}
              className="flex items-center gap-1 hover:text-ink transition-colors"
            >
              {foldersExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <span>Pastas ({folders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCreatingFolder(true)}
              title="Criar nova pasta"
              className="rounded-md p-1 hover:bg-hover hover:text-ink"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>

          {foldersExpanded && (
            <div className="space-y-0.5">
              {/* Botão Todas */}
              <button
                type="button"
                onClick={() => setSelectedFolderId(null)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs transition-colors",
                  selectedFolderId === null
                    ? "bg-active font-medium text-ink"
                    : "text-muted hover:bg-hover hover:text-ink",
                )}
              >
                <div className="flex items-center gap-2">
                  <FolderIcon className="h-3.5 w-3.5" />
                  <span>Todas as conversas</span>
                </div>
                <span className="text-[10px] text-faint">{sessions.length}</span>
              </button>

              {/* Formulário de Criação de Pasta */}
              {isCreatingFolder && (
                <form onSubmit={handleCreateFolder} className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Nome da pasta..."
                      className="h-7 w-full rounded-lg border border-line bg-base px-2 text-xs text-ink outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-ink px-2 py-1 text-[11px] text-base"
                    >
                      Criar
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreatingFolder(false)}
                      className="rounded-lg p-1 text-faint hover:text-ink"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </form>
              )}

              {/* Lista de Pastas Criadas */}
              {folders.map((folder) => {
                const count = sessions.filter((s) => s.folderId === folder.id).length;
                const active = selectedFolderId === folder.id;

                if (editingFolderId === folder.id) {
                  return (
                    <div key={folder.id} className="flex items-center gap-1 px-2 py-1">
                      <input
                        autoFocus
                        value={editingFolderName}
                        onChange={(e) => setEditingFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveRenameFolder(folder.id);
                          if (e.key === "Escape") setEditingFolderId(null);
                        }}
                        className="h-7 w-full rounded-lg border border-line bg-base px-2 text-xs text-ink outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveRenameFolder(folder.id)}
                        className="rounded-lg bg-ink px-2 py-1 text-[11px] text-base"
                      >
                        Salvar
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={folder.id}
                    className={cn(
                      "group relative flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs transition-colors",
                      active
                        ? "bg-active font-medium text-ink"
                        : "text-muted hover:bg-hover hover:text-ink",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedFolderId(active ? null : folder.id)}
                      className="flex flex-1 items-center gap-2 truncate text-left"
                    >
                      <FolderIcon
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: folder.color || "currentColor" }}
                      />
                      <span className="truncate">{folder.name}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-faint group-hover:hidden">{count}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFolderId(folder.id);
                          setEditingFolderName(folder.name);
                        }}
                        title="Renomear pasta"
                        className="hidden rounded p-0.5 text-faint hover:text-ink group-hover:block"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Excluir a pasta "${folder.name}"? As conversas serão mantidas.`)) {
                            deleteFolder(folder.id);
                            if (selectedFolderId === folder.id) setSelectedFolderId(null);
                          }
                        }}
                        title="Excluir pasta"
                        className="hidden rounded p-0.5 text-faint hover:text-red-400 group-hover:block"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Lista de Conversas por Grupos de Tempo */}
        <div className="space-y-4">
          {groups.map((group) => {
            if (group.items.length === 0) return null;
            return (
              <div key={group.label} className="space-y-0.5">
                <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
                  {group.label}
                </p>

                {group.items.map((session) => {
                  const isActive = session.id === activeSessionId;
                  const isEditing = editingSessionId === session.id;
                  const folder = folders.find((f) => f.id === session.folderId);

                  if (isEditing) {
                    return (
                      <div key={session.id} className="flex items-center gap-1 px-2 py-1">
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveRenameSession(session.id);
                            if (e.key === "Escape") setEditingSessionId(null);
                          }}
                          className="h-7 w-full rounded-lg border border-line bg-base px-2 text-xs text-ink outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRenameSession(session.id)}
                          className="rounded-lg bg-ink px-2 py-1 text-[11px] text-base"
                        >
                          OK
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={session.id}
                      className={cn(
                        "group relative flex items-center justify-between rounded-xl px-2.5 py-2 text-xs transition-colors",
                        isActive
                          ? "bg-active font-medium text-ink shadow-2xs"
                          : "text-muted hover:bg-hover hover:text-ink",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          selectSession(session.id);
                          onClose?.();
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        <div className="min-w-0 flex-1 truncate">
                          <span className="block truncate">{session.title}</span>
                          {folder && (
                            <span className="block text-[10px] text-faint truncate">
                              📁 {folder.name}
                            </span>
                          )}
                        </div>
                      </button>

                      {/* Botões de Ação na Conversa */}
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        {/* Dropdown de Pasta */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setMenuSessionId((prev) => (prev === session.id ? null : session.id))
                            }
                            title="Mover para pasta / Opções"
                            className="rounded-md p-1 text-faint hover:bg-elevated hover:text-ink"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>

                          {menuSessionId === session.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute top-full right-0 z-50 mt-1 w-44 rounded-xl border border-line bg-base p-1 text-xs shadow-xl animate-in fade-in"
                            >
                              <div className="px-2 py-1 text-[10px] uppercase font-semibold text-faint">
                                Mover para pasta
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  moveSessionToFolder(session.id, null);
                                  setMenuSessionId(null);
                                }}
                                className={cn(
                                  "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-hover",
                                  !session.folderId && "font-medium text-ink",
                                )}
                              >
                                <span>Sem pasta</span>
                              </button>
                              {folders.map((f) => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => {
                                    moveSessionToFolder(session.id, f.id);
                                    setMenuSessionId(null);
                                  }}
                                  className={cn(
                                    "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-hover",
                                    session.folderId === f.id && "font-medium text-ink",
                                  )}
                                >
                                  <FolderIcon className="h-3 w-3" />
                                  <span className="truncate">{f.name}</span>
                                </button>
                              ))}

                              <div className="my-1 border-t border-line-subtle" />

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSessionId(session.id);
                                  setEditingTitle(session.title);
                                  setMenuSessionId(null);
                                }}
                                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-hover"
                              >
                                <Pencil className="h-3 w-3" />
                                <span>Renomear</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  deleteSession(session.id);
                                  setMenuSessionId(null);
                                }}
                                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-red-400 hover:bg-hover"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span>Excluir</span>
                              </button>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingSessionId(session.id);
                            setEditingTitle(session.title);
                          }}
                          title="Renomear"
                          className="rounded-md p-1 text-faint hover:bg-elevated hover:text-ink"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSession(session.id)}
                          title="Excluir conversa"
                          className="rounded-md p-1 text-faint hover:bg-elevated hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {filteredSessions.length === 0 && (
            <div className="py-8 text-center text-xs text-faint">
              Nenhuma conversa nesta pasta.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
