"use client";

import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, ChevronDown, Copy, Lock, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  deleteDirectMessage,
  editDirectMessage,
  getDirectConversation,
  listDirectMessages,
  sendDirectMessage,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { subscribeDirectLive } from "@/lib/direct-live";
import type { DirectConversation, DirectMessage, DirectPeer } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";

const MESSAGE_MAX = 2000;

const NAME_COLORS = ["#53bdeb", "#e542a3", "#7f66ff", "#ff8b3d", "#25d366", "#f0b429", "#ff6b81", "#5ad0c8"];

function memberColor(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return NAME_COLORS[hash % NAME_COLORS.length] ?? NAME_COLORS[0];
}

export function DirectThread({
  conversationId,
  draftPeerId,
  peers,
  peersLoading,
  canWrite,
  onlineIds,
  onBack,
  onConversation,
  onOpen,
  onError,
}: {
  conversationId?: string;
  draftPeerId?: string;
  peers: DirectPeer[];
  peersLoading: boolean;
  canWrite: boolean;
  onlineIds: string[];
  onBack: () => void;
  onConversation: (conversation: DirectConversation) => void;
  onOpen: (id: string) => void;
  onError: (text: string) => void;
}) {
  const me = useWorkspace((state) => state.user?.id);
  const [conversation, setConversation] = useState<DirectConversation | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [missing, setMissing] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const onConversationRef = useRef(onConversation);
  const onErrorRef = useRef(onError);
  onConversationRef.current = onConversation;
  onErrorRef.current = onError;

  const draftPeer = draftPeerId ? peers.find((peer) => peer.id === draftPeerId) ?? null : null;
  const peer = conversation?.peer ?? draftPeer;

  useEffect(() => {
    setDraft("");
    setMessages([]);
    setNextCursor(null);
    setConversation(null);
    setMissing("");
    stick.current = true;
    if (!conversationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getDirectConversation(conversationId)
      .then((row) => {
        if (cancelled) return;
        setConversation(row);
        onConversationRef.current(row);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setMissing(caught instanceof ApiError ? caught.message : "Conversa não encontrada.");
      });
    listDirectMessages(conversationId)
      .then((page) => {
        if (cancelled) return;
        setMessages(page.messages);
        setNextCursor(page.nextCursor);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          onErrorRef.current(caught instanceof ApiError ? caught.message : "Não foi possível carregar a conversa.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    return subscribeDirectLive((event) => {
      if (event.kind === "direct" && event.conversation.id === conversationId) {
        setConversation(event.conversation);
        onConversationRef.current(event.conversation);
      }
      if (!conversationId) return;
      if (event.kind === "direct-message" && event.message.conversationId === conversationId) {
        setMessages((current) =>
          current.some((item) => item.id === event.message.id)
            ? current.map((item) => (item.id === event.message.id ? event.message : item))
            : [...current, event.message],
        );
      }
      if (event.kind === "direct-message-removed" && event.conversationId === conversationId) {
        setMessages((current) => current.filter((item) => item.id !== event.messageId));
      }
    });
  }, [conversationId]);

  useEffect(() => {
    if (!stick.current) return;
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, conversationId]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  async function loadOlder() {
    if (!conversationId || !nextCursor) return;
    const el = scroller.current;
    const height = el?.scrollHeight ?? 0;
    try {
      const page = await listDirectMessages(conversationId, { before: nextCursor });
      stick.current = false;
      setMessages((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...page.messages.filter((item) => !ids.has(item.id)), ...current];
      });
      setNextCursor(page.nextCursor);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - height;
      });
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : "Não foi possível carregar o histórico.");
    }
  }

  async function send() {
    const target = peer?.id;
    const text = draft.trim();
    if (!target || !text || sending || !canWrite) return;
    setSending(true);
    try {
      const result = await sendDirectMessage(target, draft);
      setDraft("");
      onConversation(result.conversation);
      if (!conversationId) {
        onOpen(result.conversation.id);
        return;
      }
      setConversation(result.conversation);
      setMessages((current) =>
        current.some((item) => item.id === result.message.id) ? current : [...current, result.message],
      );
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  }

  if (!conversationId && !draftPeerId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-faint">
        Escolha alguém da equipe para uma conversa privada.
      </div>
    );
  }

  if (!conversationId && draftPeerId && !draftPeer) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-faint">
        {peersLoading ? "Abrindo a conversa…" : "Escolha alguém da equipe deste espaço."}
      </div>
    );
  }

  if (missing) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-faint">
        {missing}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 md:px-4">
        <button
          type="button"
          className="rounded-md p-1.5 text-faint hover:bg-hover hover:text-ink md:hidden"
          aria-label="Ver conversas"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        </button>
        {peer ? (
          <Avatar initials={peer.initials} src={peer.avatar} name={peer.name} size="sm" />
        ) : null}
        <span className="min-w-0">
          <h1 className="truncate text-sm font-medium">{peer?.name ?? "Conversa"}</h1>
        </span>
        <span className="hidden min-w-0 flex-1 items-center gap-1 truncate text-xs text-faint sm:flex">
          <Lock className="h-3 w-3 shrink-0" strokeWidth={1.75} />
          Só vocês dois veem esta conversa.
        </span>
      </header>

      <div
        ref={scroller}
        onScroll={() => {
          const el = scroller.current;
          if (!el) return;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {nextCursor ? (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              onClick={() => void loadOlder()}
              className="rounded-full px-3 py-1 text-xs text-faint hover:bg-hover hover:text-ink"
            >
              Mensagens anteriores
            </button>
          </div>
        ) : null}
        {loading ? <p className="text-sm text-faint">Carregando mensagens…</p> : null}
        {!loading && messages.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-start justify-center">
            <Lock className="mb-3 h-8 w-8 text-faint" strokeWidth={1.5} />
            <p className="text-lg font-medium">{peer?.name}</p>
            <p className="mt-1 max-w-md text-sm leading-6 text-faint">
              Escreva a primeira mensagem. Ela fica só entre vocês, fora dos canais da equipe.
            </p>
          </div>
        ) : (
          <ol>
            {messages.map((message, index) => (
              <DirectBubble
                key={message.id}
                message={message}
                previous={messages[index - 1]}
                mine={message.authorId === me}
                peer={peer}
                online={onlineIds.includes(message.authorId)}
                canWrite={canWrite}
                onChanged={(saved) =>
                  setMessages((current) => current.map((item) => (item.id === saved.id ? saved : item)))
                }
                onRemoved={(id) => setMessages((current) => current.filter((item) => item.id !== id))}
                onError={onError}
              />
            ))}
          </ol>
        )}
        <div ref={bottom} />
      </div>

      {canWrite ? (
        <form
          className="px-4 pb-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="flex items-end gap-2 rounded-3xl bg-elevated px-3 py-1.5">
            <label className="sr-only" htmlFor="direct-composer">
              Mensagem privada{peer ? ` para ${peer.name}` : ""}
            </label>
            <textarea
              id="direct-composer"
              ref={box}
              value={draft}
              rows={1}
              maxLength={MESSAGE_MAX}
              placeholder="Mensagem privada"
              onChange={(event) => setDraft(event.target.value.slice(0, MESSAGE_MAX))}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm leading-6 text-ink outline-none placeholder:text-faint"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim() || !peer}
              className="mb-1 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-base disabled:opacity-40"
            >
              Enviar
            </button>
          </div>
          {draft.length >= 1800 ? (
            <p className="mt-1 text-right text-[11px] text-faint">
              {draft.length}/{MESSAGE_MAX}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="px-4 pb-4">
          <p className="rounded-lg bg-elevated px-3 py-3 text-sm text-faint">
            Sua conta pode ler esta conversa, sem enviar mensagens.
          </p>
        </div>
      )}
    </div>
  );
}

function DirectBubble({
  message,
  previous,
  mine,
  peer,
  online,
  canWrite,
  onChanged,
  onRemoved,
  onError,
}: {
  message: DirectMessage;
  previous?: DirectMessage;
  mine: boolean;
  peer: DirectPeer | null;
  online: boolean;
  canWrite: boolean;
  onChanged: (message: DirectMessage) => void;
  onRemoved: (id: string) => void;
  onError: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const dayChanged = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
  const grouped =
    !dayChanged &&
    previous?.authorId === message.authorId &&
    new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60 * 1000;
  const canCopy = message.body.trim().length > 0;
  const showMenu = canCopy || (mine && canWrite);
  const color = memberColor(message.authorId);

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

  function closeMenu() {
    setMenu(null);
    setConfirming(false);
  }

  function openMenu() {
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 232;
    const height = confirming ? 112 : 168;
    const top = rect.bottom + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : rect.bottom + 6;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    setConfirming(false);
    setMenu({ top, left });
  }

  async function save() {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      onChanged(await editDirectMessage(message.conversationId, message.id, draft));
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
      await deleteDirectMessage(message.conversationId, message.id);
      onRemoved(message.id);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : "Não foi possível apagar.");
      setBusy(false);
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message.body);
      closeMenu();
    } catch {
      onError("Não foi possível copiar.");
    }
  }

  const menuButton = showMenu ? (
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
  ) : null;

  const stamp = (
    <span className="float-right mt-1 ml-3 inline-flex items-center gap-0.5">
      <time
        className={cn("text-[10px] leading-4 whitespace-nowrap", mine ? "text-white/60" : "text-faint")}
        dateTime={message.createdAt}
      >
        {message.editedAt ? "editada · " : ""}
        {format(parseISO(message.createdAt), "HH:mm")}
      </time>
      {mine || grouped ? menuButton : null}
    </span>
  );

  return (
    <li className={cn(previous && (grouped ? "mt-0.5" : "mt-3"))}>
      {dayChanged ? (
        <div className="my-3 flex justify-center">
          <span className="rounded-lg bg-elevated px-3 py-1 text-[11px] text-faint">{dayLabel(message.createdAt)}</span>
        </div>
      ) : null}
      <div className={cn("flex w-full items-end gap-2", mine ? "justify-end" : "justify-start")}>
        {mine ? null : grouped ? (
          <span className="w-8 shrink-0" />
        ) : (
          <Avatar initials={peer?.initials ?? "?"} src={peer?.avatar} name={peer?.name} size="sm" online={online} />
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
              onChange={(event) => setDraft(event.target.value.slice(0, MESSAGE_MAX))}
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
                  <span className="min-w-0 truncate">{peer?.name ?? "Equipe"}</span>
                  {menuButton}
                </p>
              )}
              <MessageBody body={message.body} mine={mine} meta={stamp} />
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
                  {mine && canWrite ? (
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

function MessageBody({ body, mine, meta }: { body: string; mine: boolean; meta?: ReactNode }) {
  const pieces = useMemo(() => linkPieces(body), [body]);
  return (
    <p className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", mine ? "text-white" : "text-ink")}>
      {pieces.map((piece, index) =>
        piece.kind === "link" ? (
          <a
            key={index}
            href={piece.href}
            target="_blank"
            rel="noreferrer noopener"
            className="font-bold text-[#53bdeb] underline decoration-[#53bdeb] underline-offset-2"
          >
            {piece.text}
          </a>
        ) : (
          <span key={index}>{piece.text}</span>
        ),
      )}
      {meta}
    </p>
  );
}

function linkPieces(body: string) {
  const pieces: Array<{ kind: "text"; text: string } | { kind: "link"; text: string; href: string }> = [];
  let index = 0;
  while (index < body.length) {
    const match = /https?:\/\//.exec(body.slice(index));
    if (!match) {
      pieces.push({ kind: "text", text: body.slice(index) });
      break;
    }
    const next = index + match.index;
    if (next > index) pieces.push({ kind: "text", text: body.slice(index, next) });
    const raw = body.slice(next).split(/\s/)[0] ?? "";
    const text = raw.replace(/[),.;:!?]+$/g, "");
    let href = "";
    try {
      const url = new URL(text);
      if (url.protocol === "http:" || url.protocol === "https:") href = url.href;
    } catch {
      href = "";
    }
    if (!href) {
      pieces.push({ kind: "text", text: raw || body[next] || "" });
      index = next + Math.max(raw.length, 1);
      continue;
    }
    pieces.push({ kind: "link", text, href });
    const trailing = raw.slice(text.length);
    if (trailing) pieces.push({ kind: "text", text: trailing });
    index = next + raw.length;
  }
  return pieces;
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
