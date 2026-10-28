"use client";

import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  MoreVertical,
  Pencil,
  RotateCcw,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import {
  sidebarNavIconClass,
  sidebarNavItemClass,
  sidebarNavSubtextClass,
} from "@/lib/sidebar-nav";
import { TRASH_RETENTION_DAYS, trashRetentionLabel, useChat } from "@/lib/chat";
import type { ChatFolder, ChatSession } from "@/lib/types";

const FOLDER_COLORS = [
  "#6366f1",
  "#a78bfa",
  "#34d399",
  "#60a5fa",
  "#f97316",
  "#f472b6",
  "#facc15",
  "#f87171",
];

const DEFAULT_FOLDER_COLOR = FOLDER_COLORS[0];

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
  const restoreSession = useChat((state) => state.restoreSession);
  const purgeSession = useChat((state) => state.purgeSession);
  const emptyTrash = useChat((state) => state.emptyTrash);
  const purgeExpiredTrash = useChat((state) => state.purgeExpiredTrash);
  const createFolder = useChat((state) => state.createFolder);
  const renameFolder = useChat((state) => state.renameFolder);
  const setFolderColor = useChat((state) => state.setFolderColor);
  const deleteFolder = useChat((state) => state.deleteFolder);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState(DEFAULT_FOLDER_COLOR);

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [editingFolderColor, setEditingFolderColor] = useState(DEFAULT_FOLDER_COLOR);

  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [foldersExpanded, setFoldersExpanded] = useState(true);
  const [showTrash, setShowTrash] = useState(false);
  const [trashNotice, setTrashNotice] = useState<{ id: string; title: string } | null>(null);

  // Estados de arrastar e soltar (Drag and Drop)
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    createFolder(newFolderName.trim(), newFolderColor);
    setNewFolderName("");
    setNewFolderColor(DEFAULT_FOLDER_COLOR);
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
    setFolderColor(id, editingFolderColor);
    setEditingFolderId(null);
  }

  function beginEditFolder(folder: ChatFolder) {
    setEditingFolderId(folder.id);
    setEditingFolderName(folder.name);
    setEditingFolderColor(folder.color || DEFAULT_FOLDER_COLOR);
  }

  function startChatInFolder(folderId: string) {
    setSelectedFolderId(folderId);
    const id = createSession(folderId);
    selectSession(id);
    setShowTrash(false);
    onClose?.();
  }

  const liveSessions = sessions.filter((session) => !session.deletedAt);
  const trashedSessions = sessions
    .filter((session): session is ChatSession & { deletedAt: string } => Boolean(session.deletedAt))
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  function moveToTrash(id: string) {
    const session = sessions.find((item) => item.id === id);
    deleteSession(id);
    setMenuSessionId(null);
    if (!session || session.deletedAt) return;
    setTrashNotice({ id, title: session.title });
  }

  function handleRestore(id: string) {
    restoreSession(id);
    setTrashNotice((current) => (current?.id === id ? null : current));
    setShowTrash(false);
    onClose?.();
  }

  function handlePurge(session: ChatSession) {
    if (
      confirm(`Apagar permanentemente "${session.title}"? Essa ação não pode ser desfeita.`)
    ) {
      purgeSession(session.id);
      setTrashNotice((current) => (current?.id === session.id ? null : current));
    }
  }

  function handleEmptyTrash() {
    if (trashedSessions.length === 0) return;
    if (
      confirm(
        "Apagar permanentemente todas as conversas da lixeira? Essa ação não pode ser desfeita.",
      )
    ) {
      emptyTrash();
      setTrashNotice(null);
    }
  }

  useEffect(() => {
    if (useChat.persist.hasHydrated()) purgeExpiredTrash();
    return useChat.persist.onFinishHydration(() => {
      useChat.getState().purgeExpiredTrash();
    });
  }, [purgeExpiredTrash]);

  useEffect(() => {
    if (!trashNotice) return;
    const timer = window.setTimeout(() => setTrashNotice(null), 7000);
    return () => window.clearTimeout(timer);
  }, [trashNotice]);

  // Filtra as conversas caso uma pasta específica esteja selecionada
  const filteredSessions = selectedFolderId
    ? liveSessions.filter((s) => s.folderId === selectedFolderId)
    : liveSessions;

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
        "flex h-full w-[232px] shrink-0 flex-col bg-elevated/70 backdrop-blur-xs transition-[width,transform] duration-200 ease-in-out",
        !open && "hidden md:flex md:w-0 md:overflow-hidden",
      )}
    >
      {/* Topo do Sidebar: Novo Chat e Fechar Mobile */}
      <div className="flex h-[68px] items-center justify-between gap-2 px-3 py-4">
        <button
          type="button"
          onClick={() => {
            const id = createSession(selectedFolderId);
            selectSession(id);
            setShowTrash(false);
            onClose?.();
          }}
          className="flex h-9 flex-1 items-center gap-2.5 rounded-xl bg-hover/80 px-3 text-[14px] font-medium text-ink hover:bg-hover transition-colors shadow-2xs"
        >
          <SquarePen className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.5} />
          <span>Novo Chat</span>
        </button>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-faint hover:bg-hover hover:text-ink md:hidden"
            aria-label="Fechar painel"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
        {showTrash ? (
          <TrashPanel
            sessions={trashedSessions}
            folders={folders}
            activeSessionId={activeSessionId}
            onOpen={(id) => {
              selectSession(id);
              onClose?.();
            }}
            onRestore={handleRestore}
            onPurge={handlePurge}
            onEmpty={handleEmptyTrash}
          />
        ) : (
        <>
        {/* Seção de Pastas */}
        <div>
          <div className="mb-1 flex items-center justify-between px-2 text-[11px] font-medium uppercase tracking-wider text-faint">
            <button
              type="button"
              onClick={() => setFoldersExpanded((prev) => !prev)}
              className="flex items-center gap-1 uppercase hover:text-ink transition-colors"
            >
              {foldersExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <span>PASTAS ({folders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setNewFolderColor(DEFAULT_FOLDER_COLOR);
                setIsCreatingFolder(true);
              }}
              title="Criar nova pasta"
              className="rounded-md p-1 hover:bg-hover hover:text-ink"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>

          {foldersExpanded && (
            <div className="space-y-0.5">
              {/* Botão Todas as Conversas (Drop target para remover de pastas) */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOverFolderId("root");
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverFolderId((prev) => (prev === "root" ? null : prev));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const sid = e.dataTransfer.getData("text/plain") || draggedSessionId;
                  if (sid) moveSessionToFolder(sid, null);
                  setDragOverFolderId(null);
                  setDraggedSessionId(null);
                }}
                className={cn(
                  "rounded-xl transition-all",
                  dragOverFolderId === "root" &&
                    cn("ring-2 ring-ink/30 scale-[1.02]", sidebarNavItemClass(true)),
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedFolderId(null)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-[14px] transition-colors",
                    selectedFolderId === null
                      ? sidebarNavItemClass(true)
                      : "text-inherit",
                  )}
                >
                  {dragOverFolderId === "root" ? (
                    <FolderOpen
                      className={cn(
                        "h-3.5 w-3.5 animate-pulse",
                        sidebarNavIconClass(selectedFolderId === null),
                      )}
                    />
                  ) : (
                    <FolderIcon
                      className={cn("h-3.5 w-3.5", sidebarNavIconClass(selectedFolderId === null))}
                    />
                  )}
                  <span
                    className={
                      selectedFolderId === null
                        ? "text-[var(--sidebar-nav-active-fg)]"
                        : undefined
                    }
                  >
                    Todas as conversas
                  </span>
                </button>
              </div>

              {/* Formulário de Criação de Pasta */}
              {isCreatingFolder && (
                <form onSubmit={handleCreateFolder} className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Nome da pasta..."
                      className="h-7 w-full rounded-lg bg-base px-2 text-xs text-ink outline-none ring-1 ring-ink/10 focus:ring-ink/30"
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
                  <FolderColorSwatches
                    value={newFolderColor}
                    onChange={setNewFolderColor}
                  />
                </form>
              )}

              {/* Lista de Pastas Criadas (Drop targets) */}
              {folders.map((folder) => {
                const active = selectedFolderId === folder.id;
                const isDropTarget = dragOverFolderId === folder.id;

                if (editingFolderId === folder.id) {
                  return (
                    <div key={folder.id} className="px-2 py-1">
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={editingFolderName}
                          onChange={(e) => setEditingFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveRenameFolder(folder.id);
                            if (e.key === "Escape") setEditingFolderId(null);
                          }}
                          className="h-7 w-full rounded-lg bg-base px-2 text-xs text-ink outline-none ring-1 ring-ink/10 focus:ring-ink/30"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRenameFolder(folder.id)}
                          className="rounded-lg bg-ink px-2 py-1 text-[11px] text-base"
                        >
                          Salvar
                        </button>
                      </div>
                      <FolderColorSwatches
                        value={editingFolderColor}
                        onChange={setEditingFolderColor}
                      />
                    </div>
                  );
                }

                return (
                  <div
                    key={folder.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      setDragOverFolderId(folder.id);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOverFolderId((prev) => (prev === folder.id ? null : prev));
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const sid = e.dataTransfer.getData("text/plain") || draggedSessionId;
                      if (sid) moveSessionToFolder(sid, folder.id);
                      setDragOverFolderId(null);
                      setDraggedSessionId(null);
                    }}
                    className={cn(
                      "group relative flex items-center justify-between rounded-xl px-2.5 py-1.5 text-[14px] transition-all",
                      sidebarNavItemClass(active),
                      isDropTarget &&
                        cn("ring-2 ring-ink/30 scale-[1.02]", sidebarNavItemClass(true)),
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedFolderId(active ? null : folder.id)}
                      className="flex flex-1 items-center gap-2 truncate text-left"
                    >
                      {isDropTarget ? (
                        <FolderOpen
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 animate-pulse",
                            sidebarNavIconClass(active),
                          )}
                          style={active ? undefined : { color: folder.color || undefined }}
                        />
                      ) : (
                        <FolderIcon
                          className={cn("h-3.5 w-3.5 shrink-0", sidebarNavIconClass(active))}
                          style={active ? undefined : { color: folder.color || undefined }}
                        />
                      )}
                      <span className="truncate">{folder.name}</span>
                    </button>

                    <div
                      className={cn(
                        "flex items-center gap-1 transition-opacity",
                        active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => startChatInFolder(folder.id)}
                        title="Novo chat nesta pasta"
                        aria-label={`Novo chat em ${folder.name}`}
                        className="rounded p-0.5 text-faint hover:text-ink"
                      >
                        <SquarePen className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => beginEditFolder(folder)}
                        title="Editar pasta"
                        className="rounded p-0.5 text-faint hover:text-ink"
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
                        className="rounded p-0.5 text-faint hover:text-red-400"
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
                          className="h-7 w-full rounded-lg bg-base px-2 text-xs text-ink outline-none ring-1 ring-ink/10 focus:ring-ink/30"
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

                  const isBeingDragged = draggedSessionId === session.id;

                  return (
                    <div
                      key={session.id}
                      draggable={!isEditing}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", session.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggedSessionId(session.id);
                        if (!foldersExpanded) setFoldersExpanded(true);
                      }}
                      onDragEnd={() => {
                        setDraggedSessionId(null);
                        setDragOverFolderId(null);
                      }}
                      className={cn(
                        "group relative flex items-center justify-between rounded-xl px-2.5 py-1.5 text-[14px] transition-all cursor-pointer active:cursor-grabbing select-none",
                        sidebarNavItemClass(isActive),
                        isBeingDragged && "opacity-40 scale-95 shadow-md cursor-grabbing",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          selectSession(session.id);
                          onClose?.();
                        }}
                        className="flex min-w-0 flex-1 items-center text-left cursor-pointer text-inherit active:cursor-grabbing"
                      >
                        <span className="block truncate -translate-y-px text-inherit">
                          {session.title}
                        </span>
                        {folder && (
                          <span
                            className={cn(
                              "mt-0.5 block truncate text-[11px]",
                              sidebarNavSubtextClass(isActive),
                            )}
                          >
                            {folder.name}
                          </span>
                        )}
                      </button>

                      {/* Botões de Ação na Conversa */}
                      <div
                        className={cn(
                          "flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100",
                          menuSessionId === session.id && "opacity-100",
                        )}
                      >
                        {/* Dropdown de Pasta */}
                        <SessionOptionsMenu
                          open={menuSessionId === session.id}
                          onToggle={() =>
                            setMenuSessionId((prev) => (prev === session.id ? null : session.id))
                          }
                          onClose={() => setMenuSessionId(null)}
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
                                  <FolderIcon
                                    className="h-3 w-3 shrink-0"
                                    style={{ color: f.color || DEFAULT_FOLDER_COLOR }}
                                  />
                                  <span className="truncate">{f.name}</span>
                                </button>
                              ))}

                              <div className="my-1 h-px bg-hover" />

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
                                onClick={() => moveToTrash(session.id)}
                                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs text-red-400 hover:bg-hover"
                              >
                                <Trash2 className="h-3 w-3 shrink-0" />
                                <span className="min-w-0">
                                  <span className="block">Mover para a lixeira</span>
                                  <span className="block text-[10px] font-normal text-faint">
                                    Apagada em {TRASH_RETENTION_DAYS} dias
                                  </span>
                                </span>
                              </button>
                        </SessionOptionsMenu>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingSessionId(session.id);
                            setEditingTitle(session.title);
                          }}
                          title="Renomear"
                          className="rounded p-0.5 text-faint hover:bg-elevated hover:text-ink"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveToTrash(session.id)}
                          title={`Mover para a lixeira. Apagada em ${TRASH_RETENTION_DAYS} dias`}
                          className="rounded p-0.5 text-faint hover:bg-elevated hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
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
        </>
        )}
      </div>

      {trashNotice && (
        <div className="mx-2 mb-1 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] leading-4 text-amber-500">
          <p>
            <span className="font-medium text-ink">“{trashNotice.title}”</span> foi para a lixeira
            e será apagada permanentemente em {TRASH_RETENTION_DAYS} dias.
          </p>
          <button
            type="button"
            onClick={() => handleRestore(trashNotice.id)}
            className="mt-1.5 font-medium text-ink hover:underline"
          >
            Desfazer
          </button>
        </div>
      )}

      <div className="shrink-0 border-t border-line/70 px-2 py-2">
        <button
          type="button"
          onClick={() => setShowTrash((open) => !open)}
          aria-pressed={showTrash}
          className={cn(
            "flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-[14px] transition-colors",
            sidebarNavItemClass(showTrash),
          )}
        >
          <Trash2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span>Lixeira</span>
          {trashedSessions.length > 0 && (
            <span className="ml-auto text-[10px] text-faint">{trashedSessions.length}</span>
          )}
        </button>
      </div>
    </aside>
  );
}

function TrashPanel({
  sessions,
  folders,
  activeSessionId,
  onOpen,
  onRestore,
  onPurge,
  onEmpty,
}: {
  sessions: Array<ChatSession & { deletedAt: string }>;
  folders: ChatFolder[];
  activeSessionId: string | null;
  onOpen: (id: string) => void;
  onRestore: (id: string) => void;
  onPurge: (session: ChatSession) => void;
  onEmpty: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-[12px] leading-4 text-amber-500">
        <p>
          As conversas ficam na lixeira por {TRASH_RETENTION_DAYS} dias. Depois disso, são
          apagadas permanentemente.
        </p>
        {sessions.length > 0 && (
          <button
            type="button"
            onClick={onEmpty}
            className="mt-2 font-medium text-red-400 hover:underline"
          >
            Esvaziar lixeira
          </button>
        )}
      </div>

      {sessions.length === 0 ? (
        <p className="px-2 py-8 text-center text-xs text-faint">Nenhuma conversa na lixeira.</p>
      ) : (
        <div className="space-y-0.5">
          {sessions.map((session) => {
            const folder = folders.find((item) => item.id === session.folderId);
            const active = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                className={cn(
                  "rounded-xl px-2.5 py-2",
                  sidebarNavItemClass(active),
                )}
              >
                <button
                  type="button"
                  onClick={() => onOpen(session.id)}
                  className="block w-full min-w-0 text-left"
                >
                  <span className="block truncate text-[14px] leading-5">{session.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-amber-500/90">
                    {trashRetentionLabel(session.deletedAt)}
                    {folder ? ` · ${folder.name}` : ""}
                  </span>
                </button>
                <div className="mt-1.5 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onRestore(session.id)}
                    className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-muted hover:bg-elevated hover:text-ink"
                  >
                    <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
                    Restaurar
                  </button>
                  <button
                    type="button"
                    onClick={() => onPurge(session)}
                    className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-faint hover:bg-elevated hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                    Apagar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SessionOptionsMenu({
  open,
  onToggle,
  onClose,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const button = buttonRef.current;
      const menu = menuRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = menu?.offsetWidth ?? 208;
      const height = menu?.offsetHeight ?? 220;
      let left = rect.right - width;
      let top = rect.bottom + 4;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      if (top + height > window.innerHeight - 8) {
        top = Math.max(8, rect.top - height - 4);
      }
      setCoords({ top, left });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        title="Mover para pasta / Opções"
        aria-expanded={open}
        className="rounded p-0.5 text-faint hover:bg-elevated hover:text-ink"
      >
        <MoreVertical className="h-3 w-3" />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              onClick={(event) => event.stopPropagation()}
              style={{ top: coords.top, left: coords.left }}
              className="fixed z-[60] w-52 rounded-xl border border-line bg-elevated p-1 text-xs shadow-xl menu-in"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function FolderColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const colors = FOLDER_COLORS.includes(value) ? FOLDER_COLORS : [value, ...FOLDER_COLORS];
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Cor da pasta">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label="Selecionar cor"
          aria-pressed={value === color}
          onClick={() => onChange(color)}
          className="h-5 w-5 rounded-full border border-line"
          style={{
            backgroundColor: color,
            outline: value === color ? "2px solid var(--text-primary)" : undefined,
            outlineOffset: 1,
          }}
        />
      ))}
    </div>
  );
}
