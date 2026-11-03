"use client";

import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
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

export function DirectThread({
  conversationId,
  draftPeerId,
  peers,
  peersLoading,
  canWrite,
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
  canWrite,
  onChanged,
  onRemoved,
  onError,
}: {
  message: DirectMessage;
  previous?: DirectMessage;
  mine: boolean;
  peer: DirectPeer | null;
  canWrite: boolean;
  onChanged: (message: DirectMessage) => void;
  onRemoved: (id: string) => void;
  onError: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const dayChanged = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);

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

  return (
    <li className={cn("flex flex-col", dayChanged ? "mt-4" : "mt-1")}>
      {dayChanged ? (
        <p className="mb-3 text-center text-[11px] text-faint">{dayLabel(message.createdAt)}</p>
      ) : null}
      <div className={cn("flex w-full", mine ? "justify-end" : "justify-start")}>
        <div className={cn("max-w-[82%]", mine ? "items-end" : "items-start")}>
          {editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, MESSAGE_MAX))}
                rows={2}
                className="w-full resize-none rounded-2xl bg-elevated px-3 py-2 text-sm leading-6 text-ink outline-none"
              />
              <div className="mt-1 flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(false)} className="text-xs text-faint">
                  Cancelar
                </button>
                <button type="submit" disabled={busy} className="text-xs text-ink">
                  Salvar
                </button>
              </div>
            </form>
          ) : (
            <div
              className={cn(
                "rounded-2xl px-2.5 pt-1.5 pb-[7px] text-sm leading-5",
                mine ? "rounded-br-md bg-[#005c4b] text-white" : "rounded-bl-md bg-elevated text-ink",
              )}
            >
              <MessageBody body={message.body} mine={mine} />
              <span className={cn("float-right mt-1 ml-3 text-[10px] leading-4", mine ? "text-white/60" : "text-faint")}>
                {message.editedAt ? "editada · " : ""}
                {format(parseISO(message.createdAt), "HH:mm")}
              </span>
            </div>
          )}
          {mine && canWrite && !editing ? (
            <div className="mt-0.5 flex justify-end gap-2 px-1">
              <button type="button" onClick={() => setEditing(true)} className="text-[11px] text-faint hover:text-ink">
                Editar
              </button>
              {confirming ? (
                <button type="button" onClick={() => void remove()} disabled={busy} className="text-[11px] text-red-400">
                  Apagar esta mensagem
                </button>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className="text-[11px] text-faint hover:text-ink">
                  Apagar
                </button>
              )}
            </div>
          ) : null}
          {!mine && peer && dayChanged ? <span className="sr-only">{peer.name}</span> : null}
        </div>
      </div>
    </li>
  );
}

function MessageBody({ body, mine }: { body: string; mine: boolean }) {
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
