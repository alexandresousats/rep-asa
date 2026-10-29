"use client";

import {
  AlertCircle,
  Check,
  Copy,
  FileText,
  LoaderCircle,
  Pencil,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useChat } from "@/lib/chat";
import type { ChatMessage, ChatToolStep } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";
import { AudioPlayer } from "./audio-player";
import { Markdown } from "./markdown";

const LABELS: Record<string, [string, string]> = {
  list_projects: ["Consultando projetos", "Projetos consultados"],
  list_tasks: ["Consultando tarefas", "Tarefas consultadas"],
  get_task: ["Abrindo tarefa", "Tarefa consultada"],
  list_team: ["Consultando equipe", "Equipe consultada"],
  create_task: ["Criando tarefa", "Tarefa criada"],
  create_subtask: ["Criando subtarefa", "Subtarefa criada"],
  update_task: ["Atualizando tarefa", "Tarefa atualizada"],
  set_task_status: ["Alterando status", "Status alterado"],
  assign_task: ["Atribuindo tarefa", "Tarefa atribuída"],
  add_comment: ["Comentando", "Comentário adicionado"],
  create_project: ["Criando projeto", "Projeto criado"],
  add_project_member: ["Adicionando ao projeto", "Adicionado ao projeto"],
};

function stepLabel(step: ChatToolStep) {
  const [running, done] = LABELS[step.name] ?? ["Executando ação", "Ação executada"];
  const detail =
    typeof step.args.title === "string"
      ? step.args.title
      : typeof step.args.name === "string"
        ? step.args.name
        : "";
  const base = step.status === "done" ? done : running;
  const text = step.status === "error" ? `Falhou: ${running.toLowerCase()}` : base;
  return detail ? `${text} · ${detail}` : text;
}

function Step({ step }: { step: ChatToolStep }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs",
        step.status === "error"
          ? "border border-red-400/30 text-red-400"
          : "bg-elevated text-muted",
      )}
    >
      {step.status === "running" ? (
        <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={1.75} />
      ) : step.status === "done" ? (
        <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      ) : (
        <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      )}
      <span className="min-w-0 truncate">{stepLabel(step)}</span>
    </div>
  );
}

function ImageLightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-elevated/80 p-2 text-ink hover:bg-elevated"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Visualização ampliada"
        className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function Bubble({
  message,
  onDelete,
}: {
  message: ChatMessage;
  onDelete: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content || "");
  const sending = useChat((state) => state.sending);
  const editAndResendMessage = useChat((state) => state.editAndResendMessage);
  const inTrash = useChat((state) =>
    Boolean(state.sessions.find((session) => session.id === state.activeSessionId)?.deletedAt),
  );
  // Na conversa de um colega dá para continuar, mas não editar nem excluir mensagens.
  const shared = useChat((state) =>
    Boolean(state.sessions.find((session) => session.id === state.activeSessionId)?.shared),
  );
  const myId = useWorkspace((state) => state.user?.id);
  const locked = inTrash || shared;
  const byColleague = Boolean(message.authorName && message.authorId && message.authorId !== myId);

  useEffect(() => {
    if (!isEditing) {
      setEditText(message.content || "");
    }
  }, [message.content, isEditing]);

  function copyText() {
    if (!message.content) return;
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleSaveEdit() {
    const clean = editText.trim();
    if (!clean || sending) return;
    setIsEditing(false);
    void editAndResendMessage(message.id, clean);
  }

  if (message.role === "user") {
    if (isEditing) {
      return (
        <div className="flex justify-end">
          <div className="w-full max-w-[85%] rounded-3xl bg-elevated p-4 shadow-sm">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveEdit();
                } else if (e.key === "Escape") {
                  setIsEditing(false);
                  setEditText(message.content || "");
                }
              }}
              rows={Math.min(6, Math.max(2, editText.split("\n").length))}
              className="w-full resize-none bg-transparent text-[15px] leading-7 text-ink focus:outline-none"
              autoFocus
            />
            <div className="mt-2 flex items-center justify-end gap-2 border-t border-line/30 pt-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditText(message.content || "");
                }}
                className="rounded-full px-3.5 py-1.5 text-xs font-medium text-faint transition-colors hover:bg-hover hover:text-ink"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={!editText.trim() || sending}
                className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="group relative flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end">
          {byColleague ? (
            <span className="mb-1 px-1 text-[11px] font-medium text-faint">{message.authorName}</span>
          ) : null}
          {message.images && message.images.length > 0 && (
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              {message.images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPreviewImage(img)}
                  className="overflow-hidden rounded-2xl shadow-xs transition-transform hover:scale-102"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img}
                    alt={`Anexo ${idx + 1}`}
                    className="h-28 w-28 object-cover sm:h-36 sm:w-36"
                  />
                </button>
              ))}
            </div>
          )}

          {message.audio && (
            <div className="mb-2 w-64 max-w-full sm:w-80">
              <AudioPlayer url={message.audio.url} duration={message.audio.duration} />
            </div>
          )}

          {message.documents && message.documents.length > 0 && (
            <div className="mb-2 flex w-full flex-col gap-2">
              {message.documents.map((doc, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-2xl bg-elevated/95 p-3 text-xs text-ink shadow-2xs"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium">{doc.name}</p>
                    <p className="mt-0.5 text-[11px] text-faint">
                      {(doc.size / (1024 * 1024)).toFixed(1)} MB
                      {doc.pageCount ? ` · ${doc.pageCount} páginas` : ""}
                      {doc.pageImages?.length ? " · conteúdo visual" : ""} · Analisado pela IA
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {message.content ? (
            <div className="whitespace-pre-wrap rounded-3xl bg-elevated px-5 py-3 text-[15px] leading-7 text-ink">
              {message.content}
            </div>
          ) : null}

          {/* Ações abaixo da mensagem enviada: editar, copiar e excluir (visíveis no hover) */}
          <div className="mt-1 flex items-center justify-end gap-1.5 px-1 text-faint opacity-0 transition-opacity group-hover:opacity-100">
            {message.content && !locked ? (
              <button
                type="button"
                onClick={() => {
                  setEditText(message.content || "");
                  setIsEditing(true);
                }}
                title="Editar mensagem"
                className="rounded-md p-1 transition-colors hover:bg-hover hover:text-ink"
              >
                <Pencil className="h-4 w-4" strokeWidth={1.5} />
              </button>
            ) : null}

            {message.content ? (
              <button
                type="button"
                onClick={copyText}
                title="Copiar texto"
                className="rounded-md p-1 transition-colors hover:bg-hover hover:text-ink"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-500" strokeWidth={1.5} />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={1.5} />
                )}
              </button>
            ) : null}

            {!locked && (
              <button
                type="button"
                onClick={() => onDelete(message.id)}
                title="Excluir mensagem"
                className="rounded-md p-1 transition-colors hover:bg-hover hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        {previewImage && (
          <ImageLightbox src={previewImage} onClose={() => setPreviewImage(null)} />
        )}
      </div>
    );
  }

  const typing = message.pending && !message.content && message.steps.length === 0;

  return (
    <div className="group relative flex gap-4">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-elevated text-ink">
        <Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
      </span>

      <div className="min-w-0 flex-1 space-y-3">
        {message.steps.length > 0 ? (
          <div className="flex flex-col items-start gap-1.5">
            {message.steps.map((step) => (
              <Step key={step.id} step={step} />
            ))}
          </div>
        ) : null}

        {message.content ? <Markdown text={message.content} /> : null}

        {typing ? (
          <div className="flex items-center gap-1 py-2" aria-label="Escrevendo">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint"
                style={{ animationDelay: `${dot * 160}ms` }}
              />
            ))}
          </div>
        ) : null}

        {message.error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-red-400/30 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>{message.error}</span>
          </div>
        ) : null}

        {/* Barra de ações no hover da resposta do assistente */}
        <div className="flex items-center gap-2 pt-1 opacity-0 transition-opacity group-hover:opacity-100">
          {message.content ? (
            <button
              type="button"
              onClick={copyText}
              title="Copiar resposta"
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-faint hover:bg-hover hover:text-ink"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "Copiado" : "Copiar"}</span>
            </button>
          ) : null}
          {!locked && (
            <button
              type="button"
              onClick={() => onDelete(message.id)}
              title="Excluir mensagem"
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-faint hover:bg-hover hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Excluir</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatThread({
  messages,
  className,
}: {
  messages: ChatMessage[];
  className?: string;
}) {
  const deleteMessage = useChat((state) => state.deleteMessage);
  const endRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const root = rootRef.current?.closest("[data-chat-scroll]") as HTMLElement | null;
    if (!root) return;
    function onScroll() {
      if (!root) return;
      stick.current = root.scrollHeight - root.scrollTop - root.clientHeight < 140;
    }
    root.addEventListener("scroll", onScroll);
    return () => root.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (stick.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <div ref={rootRef} className={cn("space-y-8", className)}>
      {messages.map((message) => (
        <Bubble
          key={message.id}
          message={message}
          onDelete={(id) => deleteMessage(id)}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}
