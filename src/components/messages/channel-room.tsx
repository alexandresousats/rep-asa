"use client";

import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowDown,
  ChevronDown,
  Copy,
  CornerUpLeft,
  Hash,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Smile,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type MutableRefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmojiPicker } from "@/components/messages/channel-emoji";
import { ChannelFileList } from "@/components/messages/channel-media";
import { DirectThread } from "@/components/messages/direct-thread";
import { useToast } from "@/components/ui/toast";
import { CHANNEL_FILES_PER_MESSAGE, channelFileKindFromName, clientFileIssue } from "@/lib/channel-file-rules";
import {
  createChannel,
  deleteChannel,
  deleteChannelMessage,
  editChannelMessage,
  listChannelMessages,
  listChannels,
  listDirectConversations,
  listDirectPeers,
  postChannelMessage,
  reorderChannels,
  updateChannel,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { subscribeChannelLive } from "@/lib/channel-live";
import { subscribeDirectLive } from "@/lib/direct-live";
import { subscribePresence } from "@/lib/presence";
import { cn } from "@/lib/cn";
import type { Channel, ChannelMessage, DirectConversation, DirectPeer, User } from "@/lib/types";
import { useAccess, useWorkspace } from "@/lib/workspace";

const MESSAGE_MAX = 2000;

const NAME_COLORS = ["#53bdeb", "#e542a3", "#7f66ff", "#ff8b3d", "#25d366", "#f0b429", "#ff6b81", "#5ad0c8"];

function memberColor(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return NAME_COLORS[hash % NAME_COLORS.length] ?? NAME_COLORS[0];
}

function quoteText(body: string, fileKind?: string | null, fileName?: string | null) {
  const text = body.trim().replace(/\s+/g, " ");
  if (text) return text;
  if (fileKind === "image") return "Imagem";
  if (fileKind === "audio") return "Áudio";
  if (fileKind === "video") return "Vídeo";
  if (fileName) return fileName;
  return "Mensagem";
}

export function ChannelRoom({
  channelId,
  directId,
  draftPeerId,
  startDraft = false,
}: {
  channelId?: string;
  directId?: string;
  draftPeerId?: string;
  startDraft?: boolean;
}) {
  const router = useRouter();
  const workspaceId = useWorkspace((state) => state.workspace?.id);
  const meId = useWorkspace((state) => state.user?.id);
  const users = useWorkspace((state) => state.users);
  const { canWrite, isAdmin } = useAccess();
  const { show, node: toast } = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [showList, setShowList] = useState(!channelId && !directId && !draftPeerId && !startDraft);
  const [directs, setDirects] = useState<DirectConversation[]>([]);
  const [peers, setPeers] = useState<DirectPeer[]>([]);
  const [peersLoading, setPeersLoading] = useState(false);
  const [peersReady, setPeersReady] = useState(false);
  const [picking, setPicking] = useState(false);
  const viewingDirect = Boolean(directId || draftPeerId || startDraft);
  const [membersOpen, setMembersOpen] = useState(false);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);

  const active = channels.find((channel) => channel.id === channelId) ?? null;
  const known = Boolean(active);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setLoading(true);
    setBlocked(false);
    setError("");
    Promise.all([listChannels(), listDirectConversations()])
      .then(([rows, conversations]) => {
        if (cancelled) return;
        setChannels(rows);
        setDirects(conversations);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof ApiError && caught.status === 403) setBlocked(true);
        else setError(caught instanceof ApiError ? caught.message : "Não foi possível abrir os canais.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (viewingDirect || loading || blocked || channels.length === 0) return;
    if (!channelId || !channels.some((channel) => channel.id === channelId)) {
      router.replace(`/mensagens/${channels[0].id}`);
    }
  }, [blocked, channelId, channels, loading, router, viewingDirect]);

  useEffect(() => {
    if (channelId || directId || draftPeerId || startDraft) setShowList(false);
  }, [channelId, directId, draftPeerId, startDraft]);

  useEffect(() => {
    if (startDraft) setPicking(true);
  }, [startDraft]);

  useEffect(() => {
    if (!workspaceId || (!picking && !draftPeerId)) return;
    let cancelled = false;
    setPeersLoading(true);
    listDirectPeers()
      .then((rows) => {
        if (!cancelled) setPeers(rows);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          show(caught instanceof ApiError ? caught.message : "Não foi possível listar a equipe.", "error");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPeersLoading(false);
          setPeersReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [draftPeerId, picking, show, workspaceId]);

  useEffect(() => {
    return subscribeDirectLive((event) => {
      if (event.kind === "direct") {
        setDirects((current) => rememberDirect(current, event.conversation));
      }
      if (event.kind === "direct-removed") {
        setDirects((current) => current.filter((item) => item.id !== event.conversationId));
      }
    });
  }, []);

  useEffect(() => subscribePresence(setOnlineIds), []);

  useEffect(() => {
    if (!channelId || !known) return;
    let cancelled = false;
    setMessagesLoading(true);
    listChannelMessages(channelId)
      .then((page) => {
        if (cancelled || !channelId) return;
        setMessages((current) => {
          const ids = new Set(page.messages.map((item) => item.id));
          const newest = page.messages[page.messages.length - 1]?.createdAt ?? "";
          const extra = current.filter(
            (item) => item.channelId === channelId && !ids.has(item.id) && item.createdAt >= newest,
          );
          return [...page.messages, ...extra];
        });
        setNextCursor(page.nextCursor);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          show(caught instanceof ApiError ? caught.message : "Não foi possível carregar as mensagens.", "error");
        }
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, known, show]);

  useEffect(() => {
    return subscribeChannelLive((event) => {
      if (event.kind === "channels") {
        setChannels(event.channels);
        return;
      }
      if (event.kind === "channel") {
        setChannels((current) =>
          current.some((item) => item.id === event.channel.id)
            ? current.map((item) => (item.id === event.channel.id ? event.channel : item))
            : [...current, event.channel].sort((a, b) => a.position - b.position),
        );
        return;
      }
      if (event.kind === "channel-removed") {
        setChannels((current) => current.filter((item) => item.id !== event.channelId));
        return;
      }
      if (!channelId) return;
      if (event.kind === "channel-message" && event.message.channelId === channelId) {
        setMessages((current) =>
          current.some((item) => item.id === event.message.id)
            ? current.map((item) => (item.id === event.message.id ? event.message : item))
            : [...current, event.message],
        );
      }
      if (event.kind === "channel-message-removed" && event.channelId === channelId) {
        setMessages((current) => current.filter((item) => item.id !== event.messageId));
      }
    });
  }, [channelId]);

  function openChannel(id: string) {
    setShowList(false);
    setMembersOpen(false);
    router.push(`/mensagens/${id}`);
  }

  function openPeer(peerId: string) {
    if (!peerId || peerId === meId) return;
    setPicking(false);
    setShowList(false);
    setMembersOpen(false);
    const existing = directs.find((item) => item.peer.id === peerId);
    if (existing) router.push(`/mensagens/d/${existing.id}`);
    else if (canWrite) router.push(`/mensagens/d/novo?com=${encodeURIComponent(peerId)}`);
  }

  if (blocked) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="max-w-sm text-center text-sm leading-6 text-faint">
          As mensagens ficam só com quem foi convidado para este espaço.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-base text-ink">
      <aside
        className={cn(
          "min-h-0 w-full shrink-0 flex-col bg-sidebar md:flex md:w-[232px]",
          showList ? "flex" : "hidden",
        )}
      >
        <div className="flex h-12 items-center justify-between gap-2 border-b border-line px-3">
          <p className="px-1 text-sm font-medium">Canais</p>
          {isAdmin ? (
            <button
              type="button"
              aria-label="Novo canal"
              onClick={() => setDialog("create")}
              className="rounded-md p-1.5 text-faint hover:bg-hover hover:text-ink"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {loading ? <p className="px-2 text-sm text-faint">Carregando canais…</p> : null}
          {error ? <p className="px-2 text-sm text-red-400">{error}</p> : null}
          <ul className="space-y-0.5">
            {channels.map((channel) => (
              <li key={channel.id}>
                <button
                  type="button"
                  onClick={() => openChannel(channel.id)}
                  aria-current={!viewingDirect && channel.id === channelId ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm",
                    !viewingDirect && channel.id === channelId
                      ? "bg-active text-ink"
                      : "text-muted hover:bg-hover hover:text-ink",
                  )}
                >
                  <Hash className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} />
                  <span className="truncate">{channel.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 mb-1 flex items-center justify-between px-2">
            <p className="text-xs text-faint">Diretas</p>
            {canWrite ? (
              <button
                type="button"
                aria-label="Nova mensagem direta"
                onClick={() => setPicking(true)}
                className="rounded-md p-1 text-faint hover:bg-hover hover:text-ink"
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} />
              </button>
            ) : null}
          </div>
          {directs.length === 0 ? (
            <p className="px-2 text-xs text-faint">Nenhuma conversa direta.</p>
          ) : (
            <ul className="space-y-0.5">
              {directs.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => openPeer(conversation.peer.id)}
                    aria-current={conversation.id === directId ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
                      conversation.id === directId
                        ? "bg-active text-ink"
                        : "text-muted hover:bg-hover hover:text-ink",
                    )}
                  >
                    <Avatar
                      initials={conversation.peer.initials}
                      src={conversation.peer.avatar}
                      name={conversation.peer.name}
                      size="sm"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{conversation.peer.name}</span>
                      <span className="block truncate text-[11px] text-faint">
                        {conversation.lastAuthorId === meId && conversation.lastPreview ? "Você: " : ""}
                        {conversation.lastPreview || "Mensagem privada"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section
        className={cn(
          "relative min-h-0 min-w-0 flex-1 flex-col border-l border-line",
          showList ? "hidden md:flex" : "flex",
        )}
      >
        {viewingDirect ? (
          <DirectThread
            key={directId ?? draftPeerId ?? "nova"}
            conversationId={directId}
            draftPeerId={draftPeerId}
            peers={peers}
            peersLoading={peersLoading || !peersReady}
            canWrite={canWrite}
            onBack={() => setShowList(true)}
            onConversation={(conversation) => setDirects((current) => rememberDirect(current, conversation))}
            onOpen={(id) => router.push(`/mensagens/d/${id}`)}
            onError={(text) => show(text, "error")}
          />
        ) : active ? (
          <Transcript
            channel={active}
            channels={channels}
            messages={messages}
            users={users}
            loading={messagesLoading}
            nextCursor={nextCursor}
            canWrite={canWrite}
            isAdmin={isAdmin}
            membersOpen={membersOpen}
            onlineIds={onlineIds}
            onToggleMembers={() => setMembersOpen((open) => !open)}
            onBack={() => setShowList(true)}
            onEditChannel={() => setDialog("edit")}
            onMessages={setMessages}
            onCursor={setNextCursor}
            onError={(text) => show(text, "error")}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-faint">
            {loading ? "Abrindo o canal…" : "Escolha um canal."}
          </div>
        )}
        {membersOpen ? (
          <div className="absolute inset-y-0 right-0 z-20 w-[240px] border-l border-line bg-sidebar xl:hidden">
            <MemberList
              users={users}
              onlineIds={onlineIds}
              directs={directs}
              canWrite={canWrite}
              onOpen={openPeer}
              onClose={() => setMembersOpen(false)}
            />
          </div>
        ) : null}
      </section>

      <aside className="hidden w-[220px] shrink-0 border-l border-line bg-sidebar xl:block">
        <MemberList users={users} onlineIds={onlineIds} directs={directs} canWrite={canWrite} onOpen={openPeer} />
      </aside>

      {dialog === "create" || (dialog === "edit" && active) ? (
        <ChannelDialog
          mode={dialog}
          channel={dialog === "edit" ? active : null}
          channels={channels}
          onClose={() => setDialog(null)}
          onReordered={setChannels}
          onSaved={(next) => {
            const created = next.find((item) => !channels.some((current) => current.id === item.id));
            setChannels(next);
            setDialog(null);
            if (dialog === "create" && created) router.push(`/mensagens/${created.id}`);
          }}
          onDeleted={(nextId) => {
            setDialog(null);
            if (nextId) router.replace(`/mensagens/${nextId}`);
          }}
          onError={(text) => show(text, "error")}
        />
      ) : null}
      <Dialog open={picking} title="Nova mensagem" onClose={() => setPicking(false)}>
        {peersLoading || !peersReady ? <p className="text-sm text-faint">Carregando a equipe…</p> : null}
        {peersReady && !peersLoading && peers.length === 0 ? (
          <p className="text-sm leading-6 text-faint">
            Ninguém da equipe disponível para uma conversa direta.
          </p>
        ) : null}
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {peers.map((peer) => (
            <li key={peer.id}>
              <button
                type="button"
                onClick={() => openPeer(peer.id)}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-hover"
              >
                <Avatar initials={peer.initials} src={peer.avatar} name={peer.name} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{peer.name}</span>
                  <span className="block truncate text-xs text-faint">{peer.role}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
      {toast}
    </div>
  );
}

function rememberDirect(current: DirectConversation[], conversation: DirectConversation) {
  const next = current.some((item) => item.id === conversation.id)
    ? current.map((item) => (item.id === conversation.id ? conversation : item))
    : [conversation, ...current];
  return next.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

function Transcript({
  channel,
  channels,
  messages,
  users,
  loading,
  nextCursor,
  canWrite,
  isAdmin,
  membersOpen,
  onlineIds,
  onToggleMembers,
  onBack,
  onEditChannel,
  onMessages,
  onCursor,
  onError,
}: {
  channel: Channel;
  channels: Channel[];
  messages: ChannelMessage[];
  users: User[];
  loading: boolean;
  nextCursor: string | null;
  canWrite: boolean;
  isAdmin: boolean;
  membersOpen: boolean;
  onlineIds: string[];
  onToggleMembers: () => void;
  onBack: () => void;
  onEditChannel: () => void;
  onMessages: (messages: ChannelMessage[]) => void;
  onCursor: (cursor: string | null) => void;
  onError: (text: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const dropFiles = useRef<(list: FileList | null) => void>(() => {});
  const [dragging, setDragging] = useState(false);
  const [reply, setReply] = useState<ChannelMessage | null>(null);
  const [away, setAway] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<ChannelMessage[] | null>(null);
  const [searching, setSearching] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const names = useMemo(
    () => team(users).map((user) => user.name),
    [users],
  );
  const shown = hits ?? messages;

  useEffect(() => {
    setSearch("");
    setHits(null);
    setSearchOpen(false);
    stick.current = true;
    setAway(false);
    setDragging(false);
    setReply(null);
  }, [channel.id]);

  useEffect(() => {
    function blockFileNavigation(event: DragEvent) {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
    }
    function clearDrag() {
      setDragging(false);
    }
    window.addEventListener("dragover", blockFileNavigation);
    window.addEventListener("drop", blockFileNavigation);
    window.addEventListener("dragend", clearDrag);
    return () => {
      window.removeEventListener("dragover", blockFileNavigation);
      window.removeEventListener("drop", blockFileNavigation);
      window.removeEventListener("dragend", clearDrag);
    };
  }, []);

  useEffect(() => {
    if (!stick.current || hits) return;
    bottom.current?.scrollIntoView({ block: "end" });
  }, [hits, messages, channel.id]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setHits(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void listChannelMessages(channel.id, { q: term })
        .then((page) => {
          if (!cancelled) setHits(page.messages);
        })
        .catch((caught: unknown) => {
          if (!cancelled) {
            onErrorRef.current(caught instanceof ApiError ? caught.message : "A busca falhou.");
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [channel.id, search]);

  async function loadOlder() {
    if (!nextCursor || loadingOlder || hits) return;
    const el = scroller.current;
    const height = el?.scrollHeight ?? 0;
    setLoadingOlder(true);
    try {
      const page = await listChannelMessages(channel.id, { before: nextCursor });
      stick.current = false;
      const ids = new Set(messages.map((message) => message.id));
      onMessages([...page.messages.filter((message) => !ids.has(message.id)), ...messages]);
      onCursor(page.nextCursor);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - height;
      });
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : "Não foi possível carregar o histórico.");
    } finally {
      setLoadingOlder(false);
    }
  }

  function onDragEnter(event: ReactDragEvent) {
    if (!canWrite || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDragging(true);
  }

  function onDragOver(event: ReactDragEvent) {
    if (!canWrite || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(event: ReactDragEvent) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setDragging(false);
  }

  function onDrop(event: ReactDragEvent) {
    setDragging(false);
    if (!canWrite || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) dropFiles.current(event.dataTransfer.files);
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 md:px-4">
        <button
          type="button"
          className="rounded-md p-1.5 text-faint hover:bg-hover hover:text-ink md:hidden"
          aria-label="Ver canais"
          onClick={onBack}
        >
          <Hash className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <Hash className="hidden h-4 w-4 text-faint md:block" strokeWidth={1.75} />
        <h1 className="truncate text-sm font-medium">{channel.name}</h1>
        {channel.topic ? (
          <>
            <span className="hidden h-4 w-px bg-line sm:block" />
            <p className="hidden min-w-0 flex-1 truncate text-xs text-faint sm:block">{channel.topic}</p>
          </>
        ) : (
          <span className="flex-1" />
        )}
        <button
          type="button"
          aria-label="Buscar neste canal"
          aria-pressed={searchOpen}
          onClick={() => {
            setSearchOpen((open) => !open);
            if (searchOpen) {
              setSearch("");
              setHits(null);
            }
          }}
          className="rounded-md p-1.5 text-faint hover:bg-hover hover:text-ink"
        >
          <Search className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Ver quem está online"
          aria-pressed={membersOpen}
          onClick={onToggleMembers}
          className="relative rounded-md p-1.5 text-faint hover:bg-hover hover:text-ink xl:hidden"
        >
          <Users className="h-4 w-4" strokeWidth={1.75} />
          {team(users).some((person) => onlineIds.includes(person.id)) ? (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[#25d366]" />
          ) : null}
        </button>
        {isAdmin ? (
          <button
            type="button"
            aria-label="Editar canal"
            onClick={onEditChannel}
            className="rounded-md p-1.5 text-faint hover:bg-hover hover:text-ink"
          >
            <Pencil className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </header>

      {searchOpen ? (
        <div className="border-b border-line px-4 py-2">
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value.slice(0, 80))}
            placeholder={`Buscar em #${channel.name}`}
            className="h-9 w-full rounded-lg bg-elevated px-3 text-sm text-ink outline-none placeholder:text-faint"
          />
        </div>
      ) : null}

      <div
        ref={scroller}
        onScroll={() => {
          const el = scroller.current;
          if (!el) return;
          const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          stick.current = near;
          setAway(!near);
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {nextCursor && !hits ? (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={loadingOlder}
              className="rounded-full px-3 py-1 text-xs text-faint hover:bg-hover hover:text-ink disabled:opacity-50"
            >
              {loadingOlder ? "Carregando…" : "Mensagens anteriores"}
            </button>
          </div>
        ) : null}
        {loading && messages.length === 0 ? (
          <p className="text-sm text-faint">Carregando mensagens…</p>
        ) : null}
        {hits && search.trim().length >= 2 ? (
          <p className="mb-4 text-xs text-faint">
            {searching ? "Buscando…" : `${hits.length} ${hits.length === 1 ? "resultado" : "resultados"}`}
          </p>
        ) : null}
        {!loading && shown.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-start justify-center">
            <Hash className="mb-3 h-8 w-8 text-faint" strokeWidth={1.5} />
            <p className="text-lg font-medium">#{channel.name}</p>
            <p className="mt-1 max-w-md text-sm leading-6 text-faint">
              {hits
                ? "Nada com esse texto neste canal."
                : channel.topic || "Este canal ainda não tem mensagens. Escreva a primeira."}
            </p>
          </div>
        ) : (
          <ol>
            {shown.map((message, index) => (
              <MessageRow
                key={message.id}
                message={message}
                previous={shown[index - 1]}
                first={index === 0}
                users={users}
                names={names}
                canWrite={canWrite}
                isAdmin={isAdmin}
                online={onlineIds.includes(message.authorId)}
                channelId={channel.id}
                onReply={setReply}
                onChanged={(saved) => {
                  onMessages(messages.map((item) => (item.id === saved.id ? saved : item)));
                  setHits((current) => current?.map((item) => (item.id === saved.id ? saved : item)) ?? null);
                }}
                onRemoved={(id) => {
                  onMessages(messages.filter((item) => item.id !== id));
                  setHits((current) => current?.filter((item) => item.id !== id) ?? null);
                }}
                onError={onError}
              />
            ))}
          </ol>
        )}
        <div ref={bottom} />
      </div>

      {away && !hits ? (
        <button
          type="button"
          onClick={() => {
            stick.current = true;
            setAway(false);
            bottom.current?.scrollIntoView({ block: "end" });
          }}
          className="absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-elevated px-3 py-1.5 text-xs text-ink"
        >
          <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} />
          Ir para o fim
        </button>
      ) : null}

      <Composer
        channel={channel}
        users={users}
        enabled={canWrite}
        dropFiles={dropFiles}
        reply={reply}
        onClearReply={() => setReply(null)}
        onSent={(message) => {
          stick.current = true;
          setAway(false);
          setHits(null);
          setSearch("");
          onMessages(messages.some((item) => item.id === message.id) ? messages : [...messages, message]);
        }}
        onError={onError}
      />
      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-[color:var(--bg-base)]/90 p-8">
          <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-line bg-elevated px-8 py-8 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-ink text-[color:var(--bg-base)]">
              <Paperclip className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <p className="mt-4 text-sm font-medium text-ink">Solte para anexar</p>
            <p className="mt-1 text-xs leading-5 text-faint">
              A mensagem continua sua. Até {CHANNEL_FILES_PER_MESSAGE} arquivos.
            </p>
          </div>
        </div>
      ) : null}
      <span className="sr-only">{channels.length} canais</span>
    </div>
  );
}

function MessageRow({
  message,
  previous,
  first,
  users,
  names,
  canWrite,
  isAdmin,
  online,
  channelId,
  onReply,
  onChanged,
  onRemoved,
  onError,
}: {
  message: ChannelMessage;
  previous?: ChannelMessage;
  first: boolean;
  users: User[];
  names: string[];
  canWrite: boolean;
  isAdmin: boolean;
  online: boolean;
  channelId: string;
  onReply: (message: ChannelMessage) => void;
  onChanged: (message: ChannelMessage) => void;
  onRemoved: (id: string) => void;
  onError: (text: string) => void;
}) {
  const currentUser = useWorkspace((state) => state.user);
  const author = users.find((user) => user.id === message.authorId);
  const mine = currentUser?.id === message.authorId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menu) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      setMenu(null);
      setConfirming(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(null);
        setConfirming(false);
      }
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const dayChanged = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
  const grouped =
    !dayChanged &&
    previous?.authorId === message.authorId &&
    new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60 * 1000;

  async function save() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const saved = await editChannelMessage(channelId, message.id, draft);
      onChanged(saved);
      setEditing(false);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : "Não foi possível editar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteChannelMessage(channelId, message.id);
      onRemoved(message.id);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : "Não foi possível apagar.");
      setBusy(false);
    }
  }

  const color = memberColor(message.authorId);
  const quotedAuthor = users.find((user) => user.id === message.reply?.authorId);
  const canAct = canWrite || mine || isAdmin;
  const canCopy = message.body.trim().length > 0;
  const showMenu = canAct || canCopy;
  const stamp = (
    <span className="float-right mt-1 ml-3 inline-flex items-center gap-0.5">
      <time
        className={cn("text-[10px] leading-4 whitespace-nowrap", mine ? "text-white/60" : "text-faint")}
        dateTime={message.createdAt}
      >
        {message.editedAt ? "editada · " : ""}
        {format(parseISO(message.createdAt), "HH:mm")}
      </time>
      {showMenu && (mine || grouped) ? (
        <button
          ref={menuButtonRef}
          type="button"
          aria-label="Abrir menu da mensagem"
          aria-expanded={menu !== null}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => (menu ? closeMenu() : openMenu())}
          className={cn(
            "grid h-4 w-4 shrink-0 place-items-center rounded-full opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
            menu && "opacity-100",
            mine ? "text-white/80" : "text-faint",
          )}
        >
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      ) : null}
    </span>
  );

  function closeMenu() {
    setMenu(null);
    setConfirming(false);
  }

  function openMenu() {
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 232;
    const height = confirming ? 112 : 220;
    const top = rect.bottom + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : rect.bottom + 6;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    setConfirming(false);
    setMenu({ top, left });
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message.body);
      closeMenu();
    } catch {
      onError("Não foi possível copiar.");
    }
  }

  return (
    <li id={`msg-${message.id}`} className={cn(!first && (grouped ? "mt-0.5" : "mt-3"))}>
      {dayChanged ? (
        <div className="my-3 flex justify-center">
          <span className="rounded-lg bg-elevated px-3 py-1 text-[11px] text-faint">{dayLabel(message.createdAt)}</span>
        </div>
      ) : null}
      <div className={cn("flex w-full items-end gap-2", mine ? "justify-end" : "justify-start")}>
        {mine ? null : grouped ? (
          <span className="w-8 shrink-0" />
        ) : (
          <Avatar
            initials={author?.initials ?? "?"}
            src={author?.avatar}
            name={author?.name}
            size="sm"
            online={
              online && author?.membershipStatus !== "pending" && author?.access !== "cliente"
            }
          />
        )}
        {editing ? (
          <form
            className="w-[min(78vw,24rem)]"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <textarea
              value={draft}
              maxLength={MESSAGE_MAX}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-16 w-full resize-none rounded-2xl bg-elevated px-3 py-2 text-sm leading-6 text-ink outline-none"
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(message.body);
                  setEditing(false);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
                Salvar
              </Button>
            </div>
          </form>
        ) : (
          <div className="group relative w-max max-w-[min(82%,28rem)]">
            <div
              className={cn(
                "relative rounded-2xl px-2.5 pt-1.5 pb-[7px] text-sm leading-5",
                mine ? "rounded-br-md bg-[#005c4b] text-white" : "rounded-bl-md bg-elevated text-ink",
              )}
            >
              {mine || grouped ? null : (
                <p className="flex items-center gap-1 text-[13px] leading-5 font-medium" style={{ color }}>
                  <span className="min-w-0 truncate">{author?.name ?? "Alguém da equipe"}</span>
                  {showMenu ? (
                    <button
                      ref={menuButtonRef}
                      type="button"
                      aria-label="Abrir menu da mensagem"
                      aria-expanded={menu !== null}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={() => (menu ? closeMenu() : openMenu())}
                      className={cn(
                        "grid h-4 w-4 shrink-0 place-items-center rounded-full opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                        menu && "opacity-100",
                      )}
                    >
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </button>
                  ) : null}
                </p>
              )}
              {message.replyToId ? (
                <button
                  type="button"
                  onClick={() => document.getElementById(`msg-${message.reply?.id ?? ""}`)?.scrollIntoView({ block: "center" })}
                  className="mb-1 block max-w-full min-w-36 rounded-md border-l-4 bg-black/25 px-2 py-1 text-left"
                  style={{ borderColor: memberColor(message.reply?.authorId ?? message.replyToId) }}
                >
                  <span
                    className="block truncate text-xs font-medium"
                    style={{ color: memberColor(message.reply?.authorId ?? message.replyToId) }}
                  >
                    {quotedAuthor?.name ?? "Equipe"}
                  </span>
                  <span className={cn("block truncate text-xs", mine ? "text-white/70" : "text-faint")}>
                    {message.reply
                      ? quoteText(message.reply.body, message.reply.fileKind, message.reply.fileName)
                      : "Mensagem apagada"}
                  </span>
                </button>
              ) : null}
              {message.body.trim() ? (
                <MessageText body={message.body} names={names} mine={mine} meta={stamp} />
              ) : (
                <div className="flow-root">
                  <ChannelFileList channelId={channelId} files={message.files ?? []} embedded />
                  {stamp}
                </div>
              )}
              {message.body.trim() ? <ChannelFileList channelId={channelId} files={message.files ?? []} embedded /> : null}
            </div>
          </div>
        )}
      </div>
      {menu
        ? createPortal(
            <div
              ref={menuRef}
              style={{ top: menu.top, left: menu.left }}
              className="fixed z-[90] w-56 overflow-hidden rounded-xl border border-line bg-elevated py-1 shadow-2xl"
            >
              {confirming ? (
                <div className="px-3 py-2">
                  <p className="text-sm text-ink">Apagar esta mensagem?</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void remove()}
                      disabled={busy}
                      className="rounded-lg px-2 py-1.5 text-sm text-red-400 hover:bg-hover disabled:opacity-50"
                    >
                      Apagar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="rounded-lg px-2 py-1.5 text-sm text-faint hover:bg-hover hover:text-ink"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        onReply(message);
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-ink hover:bg-hover"
                    >
                      <CornerUpLeft className="h-4 w-4 text-faint" strokeWidth={1.75} />
                      Responder
                    </button>
                  ) : null}
                  {canCopy ? (
                    <button
                      type="button"
                      onClick={() => void copyText()}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-ink hover:bg-hover"
                    >
                      <Copy className="h-4 w-4 text-faint" strokeWidth={1.75} />
                      Copiar
                    </button>
                  ) : null}
                  {mine && canWrite ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(message.body);
                        setEditing(true);
                        closeMenu();
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-ink hover:bg-hover"
                    >
                      <Pencil className="h-4 w-4 text-faint" strokeWidth={1.75} />
                      Editar
                    </button>
                  ) : null}
                  {mine || isAdmin ? (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="mt-1 flex w-full items-center gap-3 border-t border-line px-3 py-2.5 text-left text-sm text-ink hover:bg-hover"
                    >
                      <Trash2 className="h-4 w-4 text-faint" strokeWidth={1.75} />
                      Apagar
                    </button>
                  ) : null}
                </>
              )}
            </div>,
            document.body,
          )
        : null}
    </li>
  );
}

function Composer({
  channel,
  users,
  enabled,
  dropFiles,
  reply,
  onClearReply,
  onSent,
  onError,
}: {
  channel: Channel;
  users: User[];
  enabled: boolean;
  dropFiles: MutableRefObject<(list: FileList | null) => void>;
  reply: ChannelMessage | null;
  onClearReply: () => void;
  onSent: (message: ChannelMessage) => void;
  onError: (text: string) => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [mentionOff, setMentionOff] = useState(false);
  const [sending, setSending] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const emojiBox = useRef<HTMLDivElement>(null);
  const people = team(users);
  const mention = mentionAt(draft, caret);
  const matches = mention
    ? people
        .filter((user) => user.name.toLocaleLowerCase("pt-BR").includes(mention.query.toLocaleLowerCase("pt-BR")))
        .slice(0, 6)
    : [];
  const menuOpen = Boolean(mention && matches.length > 0 && !mentionOff);

  useEffect(() => {
    setHighlight(0);
  }, [mention?.query]);

  useEffect(() => {
    if (reply) box.current?.focus();
  }, [reply]);

  useEffect(() => {
    if (!emojiOpen) return;
    function onPointer(event: MouseEvent) {
      if (!emojiBox.current?.contains(event.target as Node)) setEmojiOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setEmojiOpen(false);
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [emojiOpen]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  function insertMention(name: string) {
    if (!mention) return;
    const next = `${draft.slice(0, mention.start)}@${name} ${draft.slice(caret)}`;
    const nextCaret = mention.start + name.length + 2;
    setDraft(next.slice(0, MESSAGE_MAX));
    setCaret(nextCaret);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      const issue = clientFileIssue(file);
      if (issue) {
        onError(issue);
        continue;
      }
      if (next.length >= CHANNEL_FILES_PER_MESSAGE) {
        onError(`Uma mensagem aceita até ${CHANNEL_FILES_PER_MESSAGE} arquivos.`);
        break;
      }
      next.push(file);
    }
    setFiles(next);
  }

  dropFiles.current = addFiles;

  async function send() {
    if (!enabled || sending || menuOpen || (!draft.trim() && files.length === 0)) return;
    setSending(true);
    try {
      const message = await postChannelMessage(channel.id, draft, files, reply?.id);
      setDraft("");
      setCaret(0);
      setFiles([]);
      setEmojiOpen(false);
      onClearReply();
      onSent(message);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  }

  if (!enabled) {
    return (
      <div className="px-4 pb-4">
        <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-faint">
          Sua conta pode ler este canal, sem enviar mensagens.
        </p>
      </div>
    );
  }

  return (
    <form
      className="relative px-4 pb-4"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {menuOpen ? (
        <ul className="absolute right-4 bottom-full left-4 mb-2 overflow-hidden rounded-xl border border-line bg-elevated">
          {matches.map((user, index) => (
            <li key={user.id}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMention(user.name)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                  index === highlight ? "bg-hover" : "hover:bg-hover",
                )}
              >
                <Avatar initials={user.initials} src={user.avatar} name={user.name} size="sm" />
                <span className="truncate">{user.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {reply ? (
        <div
          className="mb-1.5 flex items-start gap-2 rounded-xl border-l-4 bg-elevated px-3 py-2"
          style={{ borderColor: memberColor(reply.authorId) }}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium" style={{ color: memberColor(reply.authorId) }}>
              {users.find((user) => user.id === reply.authorId)?.name ?? "Equipe"}
            </span>
            <span className="block truncate text-xs text-faint">
              {quoteText(reply.body, reply.files?.[0]?.kind, reply.files?.[0]?.name)}
            </span>
          </span>
          <button type="button" aria-label="Cancelar resposta" onClick={onClearReply} className="rounded-full p-1 text-faint hover:text-ink">
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </div>
      ) : null}
      <div className="relative rounded-3xl bg-elevated px-3 py-1.5">
        {emojiOpen ? (
          <div ref={emojiBox} className="absolute bottom-full left-0 z-30 mb-2">
            <EmojiPicker
              onPick={(emoji) => {
                const start = box.current?.selectionStart ?? caret;
                const next = `${draft.slice(0, start)}${emoji}${draft.slice(start)}`.slice(0, MESSAGE_MAX);
                const pos = Math.min(start + emoji.length, next.length);
                setDraft(next);
                setCaret(pos);
                requestAnimationFrame(() => {
                  box.current?.focus();
                  box.current?.setSelectionRange(pos, pos);
                });
              }}
            />
          </div>
        ) : null}
        {files.length > 0 ? (
          <ul className="mb-1.5 flex flex-wrap gap-2">
            {files.map((file, index) => (
              <PendingFile
                key={`${file.name}-${file.size}-${index}`}
                file={file}
                onRemove={() => setFiles(files.filter((_, item) => item !== index))}
              />
            ))}
          </ul>
        ) : null}
        <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          accept=".jpg,.jpeg,.png,.gif,.webp,.mp3,.wav,.m4a,.ogg,.mp4,.webm,.mov,.pdf,.txt,.docx,.xlsx,.pptx"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          aria-label="Emoji"
          aria-expanded={emojiOpen}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => setEmojiOpen((open) => !open)}
          className="mb-1 rounded-full p-1.5 text-faint hover:bg-hover hover:text-ink"
        >
          <Smile className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Anexar arquivo"
          title="Imagem até 12 MB, áudio 25 MB, vídeo 80 MB, documento 25 MB. Conta no armazenamento do espaço."
          onClick={() => fileInput.current?.click()}
          className="mb-1 rounded-full p-1.5 text-faint hover:bg-hover hover:text-ink"
        >
          <Paperclip className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <label className="sr-only" htmlFor={`composer-${channel.id}`}>
          Mensagem em {channel.name}
        </label>
        <textarea
          id={`composer-${channel.id}`}
          ref={box}
          rows={1}
          value={draft}
          maxLength={MESSAGE_MAX}
          placeholder={`Conversar em #${channel.name}`}
          onChange={(event) => {
            setMentionOff(false);
            setDraft(event.target.value);
            setCaret(event.target.selectionStart ?? event.target.value.length);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (menuOpen && event.key === "ArrowDown") {
              event.preventDefault();
              setHighlight((index) => (index + 1) % matches.length);
              return;
            }
            if (menuOpen && event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((index) => (index - 1 + matches.length) % matches.length);
              return;
            }
            if (menuOpen && event.key === "Escape") {
              event.preventDefault();
              setMentionOff(true);
              return;
            }
            if (menuOpen && event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              const chosen = matches[highlight];
              if (chosen) insertMention(chosen.name);
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm leading-6 text-ink outline-none placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={sending || (!draft.trim() && files.length === 0)}
          className="mb-1 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-base disabled:opacity-40"
        >
          Enviar
        </button>
        </div>
      </div>
      {draft.length >= 1800 ? (
        <p className="mt-1 text-right text-[11px] text-faint">
          {draft.length}/{MESSAGE_MAX}
        </p>
      ) : null}
    </form>
  );
}

function PendingFile({ file, onRemove }: { file: File; onRemove: () => void }) {
  const kind = channelFileKindFromName(file.name, file.type);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "image") return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file, kind]);

  if (url) {
    return (
      <li className="relative">
        <img src={url} alt="" className="h-16 w-16 rounded-lg border border-line bg-[#0d0c0c] object-cover" />
        <button
          type="button"
          aria-label={`Remover ${file.name}`}
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-[color:var(--bg-base)]"
        >
          <X className="h-3 w-3" strokeWidth={1.75} />
        </button>
      </li>
    );
  }

  return (
    <li className="flex max-w-full items-center gap-1 rounded-full bg-hover py-1 pr-1 pl-3 text-xs">
      <span className="truncate">{file.name}</span>
      <button
        type="button"
        aria-label={`Remover ${file.name}`}
        onClick={onRemove}
        className="rounded-full p-1 text-faint hover:text-ink"
      >
        <X className="h-3 w-3" strokeWidth={1.75} />
      </button>
    </li>
  );
}

function ChannelDialog({
  mode,
  channel,
  channels,
  onClose,
  onReordered,
  onSaved,
  onDeleted,
  onError,
}: {
  mode: "create" | "edit";
  channel: Channel | null;
  channels: Channel[];
  onClose: () => void;
  onReordered: (channels: Channel[]) => void;
  onSaved: (channels: Channel[]) => void;
  onDeleted: (nextId: string | null) => void;
  onError: (text: string) => void;
}) {
  const [name, setName] = useState(mode === "edit" ? (channel?.name ?? "") : "");
  const [topic, setTopic] = useState(mode === "edit" ? (channel?.topic ?? "") : "");
  const [busy, setBusy] = useState(false);
  const index = channel ? channels.findIndex((item) => item.id === channel.id) : -1;

  async function save() {
    setBusy(true);
    try {
      if (mode === "create") {
        const created = await createChannel({ name, topic });
        onSaved([...channels, created].sort((a, b) => a.position - b.position));
        return;
      }
      if (!channel) return;
      const saved = await updateChannel(channel.id, { name, topic });
      onSaved(channels.map((item) => (item.id === saved.id ? saved : item)));
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : "Não foi possível salvar o canal.");
      setBusy(false);
    }
  }

  async function move(direction: -1 | 1) {
    if (!channel || index < 0) return;
    const next = index + direction;
    if (next < 0 || next >= channels.length) return;
    const ids = channels.map((item) => item.id);
    const [id] = ids.splice(index, 1);
    ids.splice(next, 0, id);
    setBusy(true);
    try {
      onReordered(await reorderChannels(ids));
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : "Não foi possível reordenar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!channel) return;
    setBusy(true);
    try {
      await deleteChannel(channel.id);
      const remaining = channels.filter((item) => item.id !== channel.id);
      onSaved(remaining);
      onDeleted(remaining[0]?.id ?? null);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : "Não foi possível excluir o canal.");
      setBusy(false);
    }
  }

  return (
    <Dialog open title={mode === "create" ? "Novo canal" : "Editar canal"} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Input label="Nome" value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
        <Input
          label="Assunto"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="O que se conversa aqui"
        />
        {mode === "edit" && channels.length > 1 ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy || index <= 0} onClick={() => void move(-1)}>
              Subir
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || index < 0 || index >= channels.length - 1}
              onClick={() => void move(1)}
            >
              Descer
            </Button>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 pt-2">
          {mode === "edit" && channels.length > 1 ? (
            <button type="button" onClick={() => void remove()} disabled={busy} className="text-sm text-red-400">
              Excluir canal
            </button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={busy || name.trim().length < 2}>
            {mode === "create" ? "Criar canal" : "Salvar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function MemberList({
  users,
  onlineIds,
  directs,
  canWrite,
  onOpen,
  onClose,
}: {
  users: User[];
  onlineIds: string[];
  directs: DirectConversation[];
  canWrite: boolean;
  onOpen: (userId: string) => void;
  onClose?: () => void;
}) {
  const meId = useWorkspace((state) => state.user?.id);
  const people = team(users);
  const online = people.filter((person) => onlineIds.includes(person.id));
  const away = people.filter((person) => !onlineIds.includes(person.id));
  function openFor(person: User) {
    if (person.id === meId) return undefined;
    const existing = directs.some((item) => item.peer.id === person.id);
    if (!existing && !canWrite) return undefined;
    return () => onOpen(person.id);
  }
  return (
    <div className="px-3 py-3">
      <div className="mb-2 flex items-center justify-between px-2">
        <p className="text-xs text-faint">Online — {online.length}</p>
        {onClose ? (
          <button type="button" aria-label="Fechar equipe" onClick={onClose} className="text-faint hover:text-ink">
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      <ul className="space-y-0.5">
        {online.map((person) => (
          <MemberRow key={person.id} person={person} online onOpen={openFor(person)} />
        ))}
      </ul>
      {away.length > 0 ? (
        <>
          <p className="mt-4 mb-2 px-2 text-xs text-faint">Offline — {away.length}</p>
          <ul className="space-y-0.5">
            {away.map((person) => (
              <MemberRow key={person.id} person={person} online={false} onOpen={openFor(person)} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function MemberRow({
  person,
  online,
  onOpen,
}: {
  person: User;
  online: boolean;
  onOpen?: () => void;
}) {
  const content = (
    <>
      <Avatar
        initials={person.initials}
        src={person.avatar}
        name={person.name}
        size="sm"
        online={online}
        surface="sidebar"
      />
      <span className="min-w-0">
        <span className="block truncate text-sm">{person.name}</span>
        <span className="block truncate text-[11px] text-faint">{person.role}</span>
      </span>
    </>
  );
  if (!onOpen) {
    return <li className="flex items-center gap-2 rounded-md px-2 py-1.5">{content}</li>;
  }
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Mensagem privada para ${person.name}`}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-hover"
      >
        {content}
      </button>
    </li>
  );
}

function MessageText({
  body,
  names,
  mine,
  meta,
}: {
  body: string;
  names: string[];
  mine: boolean;
  meta?: ReactNode;
}) {
  const pieces = useMemo(() => tokenize(body, names), [body, names]);
  return (
    <p className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", mine ? "text-white" : "text-ink")}>
      {pieces.map((piece, index) => {
        if (piece.kind === "link") {
          return (
            <a
              key={index}
              href={piece.href}
              target="_blank"
              rel="noreferrer noopener"
              className="font-bold text-[#53bdeb] underline decoration-[#53bdeb] underline-offset-2"
            >
              {piece.text}
            </a>
          );
        }
        if (piece.kind === "mention") {
          return (
            <span key={index} className="rounded bg-active px-1">
              {piece.text}
            </span>
          );
        }
        return <span key={index}>{piece.text}</span>;
      })}
      {meta}
    </p>
  );
}

function team(users: User[]) {
  return users.filter(
    (user) => user.membershipStatus !== "pending" && user.access !== "cliente" && user.name.trim().length > 0,
  );
}

function dayKey(iso: string) {
  return format(parseISO(iso), "yyyy-MM-dd");
}

function dayLabel(iso: string) {
  const date = parseISO(iso);
  if (isToday(date)) return "Hoje";
  if (isYesterday(date)) return "Ontem";
  return format(date, "d 'de' MMMM", { locale: ptBR });
}

function mentionAt(value: string, caret: number) {
  const match = /(^|\s)@([^\n@]*)$/.exec(value.slice(0, caret));
  if (!match) return null;
  const query = match[2] ?? "";
  return { query, start: caret - query.length - 1 };
}

type Piece =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "mention"; text: string };

function tokenize(body: string, names: string[]): Piece[] {
  const sorted = [...names]
    .map((name) => name.trim())
    .filter((name) => name.length >= 2)
    .sort((a, b) => b.length - a.length);
  const pieces: Piece[] = [];
  let index = 0;
  while (index < body.length) {
    const urlMatch = /https?:\/\//.exec(body.slice(index));
    const urlIndex = urlMatch ? index + urlMatch.index : -1;
    let mentionAtIndex = -1;
    let mentionName = "";
    for (const name of sorted) {
      const at = body.indexOf(`@${name}`, index);
      if (at === -1) continue;
      const after = body[at + name.length + 1];
      if (after && /[\p{L}\p{N}_]/u.test(after)) continue;
      if (mentionAtIndex === -1 || at < mentionAtIndex) {
        mentionAtIndex = at;
        mentionName = name;
      }
    }
    const next =
      urlIndex === -1 ? mentionAtIndex : mentionAtIndex === -1 ? urlIndex : Math.min(urlIndex, mentionAtIndex);
    if (next === -1) {
      pieces.push({ kind: "text", text: body.slice(index) });
      break;
    }
    if (next > index) pieces.push({ kind: "text", text: body.slice(index, next) });
    if (next === mentionAtIndex) {
      const text = `@${mentionName}`;
      pieces.push({ kind: "mention", text });
      index = next + text.length;
      continue;
    }
    const raw = body.slice(next).split(/\s/)[0] ?? "";
    const link = safeHref(raw);
    if (!link) {
      pieces.push({ kind: "text", text: raw || body[next] || "" });
      index = next + Math.max(raw.length, 1);
      continue;
    }
    pieces.push({ kind: "link", text: link.text, href: link.href });
    const trailing = raw.slice(link.text.length);
    if (trailing) pieces.push({ kind: "text", text: trailing });
    index = next + raw.length;
  }
  return pieces;
}

function safeHref(raw: string) {
  const text = raw.replace(/[),.;:!?]+$/g, "");
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { text, href: url.href };
  } catch {
    return null;
  }
}
