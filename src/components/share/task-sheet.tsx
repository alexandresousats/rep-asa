"use client";

import DOMPurify from "dompurify";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Link2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  approveShareTask,
  attachmentUrl,
  requestShareChanges,
  type ClientIdentity,
  type PublicTask,
} from "@/lib/api/public-share";
import { cn } from "@/lib/cn";
import { dateRange, uniqueLabels } from "./client-calendar";
import { StatusBadge } from "./client-status";

const IDENTITY_KEY = "asa-share-client";
const MAX_MESSAGE = 2000;
const PURIFY = {
  ALLOWED_TAGS: ["a", "b", "strong", "i", "em", "u", "s", "del", "code", "pre", "p", "br", "div", "span", "h2", "h3", "blockquote", "ul", "ol", "li", "mark"],
  ALLOWED_ATTR: ["href"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
};

type Step = "idle" | "identify" | "approve" | "changes";
type Done = { kind: "approved" | "changes_requested"; name: string } | null;

function readIdentity(): ClientIdentity | null {
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<ClientIdentity>;
    return typeof data.clientName === "string" && data.clientName.trim()
      ? { clientName: data.clientName, clientEmail: data.clientEmail || undefined }
      : null;
  } catch {
    return null;
  }
}

function saveIdentity(identity: ClientIdentity) {
  try {
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // Sem armazenamento (aba anônima): pede o nome de novo na próxima vez.
  }
}

// O servidor já sanitiza; isto é uma segunda barreira no navegador.
function safeHtml(html: string) {
  if (!html.trim() || !DOMPurify.isSupported) return "";
  const clean = DOMPurify.sanitize(html, PURIFY);
  return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
}

function referenceLinks(value: string | null) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item));
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function TaskSheet({
  token,
  task,
  list,
  onNavigate,
  onClose,
  onUpdated,
}: {
  token: string;
  task: PublicTask;
  list: PublicTask[];
  onNavigate: (task: PublicTask) => void;
  onClose: () => void;
  onUpdated: (task: PublicTask) => void;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [after, setAfter] = useState<"approve" | "changes">("approve");
  const [identity, setIdentity] = useState<ClientIdentity | null>(() => readIdentity());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done>(null);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const index = list.findIndex((item) => item.id === task.id);
  const prev = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function go(target: PublicTask | null) {
    if (!target || busy) return;
    setStep("idle");
    setMessage("");
    setError("");
    setDone(null);
    onNavigate(target);
  }

  function start(action: "approve" | "changes") {
    setError("");
    setDone(null);
    if (!identity) {
      setAfter(action);
      setStep("identify");
      return;
    }
    setStep(action);
  }

  async function send(kind: "approved" | "changes_requested") {
    if (!identity) return;
    setBusy(true);
    setError("");
    try {
      const updated =
        kind === "approved"
          ? await approveShareTask(token, task.id, identity)
          : await requestShareChanges(token, task.id, identity, message.trim());
      onUpdated(updated);
      setDone({ kind, name: identity.clientName.split(" ")[0] });
      setStep("idle");
      setMessage("");
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.status === 429
          ? "Muitas respostas seguidas. Espere alguns minutos e tente de novo."
          : reason instanceof Error
            ? reason.message
            : "Não foi possível enviar. Tente de novo.",
      );
    } finally {
      setBusy(false);
    }
  }

  const description = safeHtml(task.description);
  const links = referenceLinks(task.referenceUrls);
  const images = task.attachments.filter((file) => file.mime.startsWith("image/"));
  const files = task.attachments.filter((file) => !file.mime.startsWith("image/"));
  const labels = uniqueLabels([task.demandFormat, ...task.tags.map((tag) => tag.name)]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-sheet-title"
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        className={cn(
          "relative flex h-[100dvh] w-full flex-col overflow-hidden bg-base shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-[28px] sm:border sm:border-line",
          !drag && "transition-transform duration-200",
        )}
      >
        <div
          className="shrink-0 touch-none border-b border-line-subtle pt-[env(safe-area-inset-top)] sm:pt-0"
          onPointerDown={(event) => {
            if (event.pointerType === "mouse") return;
            dragStart.current = event.clientY;
          }}
          onPointerMove={(event) => {
            if (dragStart.current === null) return;
            setDrag(Math.max(0, event.clientY - dragStart.current));
          }}
          onPointerUp={() => {
            if (drag > 120) onClose();
            dragStart.current = null;
            setDrag(0);
          }}
          onPointerCancel={() => {
            dragStart.current = null;
            setDrag(0);
          }}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
          <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4">
            <button
              ref={closeRef}
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
            >
              <X className="h-5 w-5" />
            </button>
            {list.length > 1 ? (
              <div className="flex items-center gap-1">
                <span className="mr-1 text-xs tabular-nums text-faint">
                  {index + 1} de {list.length}
                </span>
                <button
                  type="button"
                  aria-label="Tarefa anterior"
                  disabled={!prev}
                  onClick={() => go(prev)}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink disabled:opacity-30"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Próxima tarefa"
                  disabled={!next}
                  onClick={() => go(next)}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink disabled:opacity-30"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8">
          <StatusBadge task={task} />
          <h2 id="task-sheet-title" className="mt-3 text-xl font-semibold leading-snug text-ink sm:text-2xl">
            {task.title}
          </h2>
          <p className="mt-2 text-sm text-muted">{dateRange(task)}</p>
          {labels.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {labels.map((label) => (
                <span key={label} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">
                  {label}
                </span>
              ))}
            </div>
          ) : null}

          {description ? (
            <div
              className="client-rich-text mt-6 text-[15px] leading-7 text-ink"
              dangerouslySetInnerHTML={{ __html: description }}
            />
          ) : null}

          {images.length > 0 ? (
            <Section title="Imagens">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {images.map((file) => (
                  <a
                    key={file.id}
                    href={attachmentUrl(token, task.id, file.id, true)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square overflow-hidden rounded-2xl bg-elevated"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- arquivo servido pela API do link */}
                    <img
                      src={attachmentUrl(token, task.id, file.id, true)}
                      alt={file.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  </a>
                ))}
              </div>
            </Section>
          ) : null}

          {files.length > 0 ? (
            <Section title="Arquivos">
              <ul className="flex flex-col gap-2">
                {files.map((file) => {
                  const pdf = file.mime === "application/pdf";
                  return (
                    <li key={file.id}>
                      <a
                        href={attachmentUrl(token, task.id, file.id, pdf)}
                        target={pdf ? "_blank" : undefined}
                        rel="noopener noreferrer"
                        className="flex min-h-12 items-center gap-3 rounded-2xl border border-line px-4 py-2 text-sm text-ink hover:bg-hover"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted" />
                        <span className="min-w-0 flex-1 truncate">{file.name}</span>
                        <span className="text-xs text-faint">{fileSize(file.size)}</span>
                        {pdf ? (
                          <ExternalLink className="h-4 w-4 text-faint" />
                        ) : (
                          <Download className="h-4 w-4 text-faint" />
                        )}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}

          {links.length > 0 ? (
            <Section title="Referências">
              <ul className="flex flex-col gap-2">
                {links.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-11 items-center gap-2 break-all text-sm text-sky-700 hover:underline dark:text-sky-300"
                    >
                      <Link2 className="h-4 w-4 shrink-0" />
                      {url.replace(/^https?:\/\//, "")}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {task.clientFeedback.length > 0 ? (
            <Section title="Suas respostas">
              <ol className="flex flex-col gap-3">
                {[...task.clientFeedback].reverse().map((item) => (
                  <li key={`${item.kind}-${item.createdAt}`} className="flex gap-3 text-sm">
                    {item.kind === "approved" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    )}
                    <div className="min-w-0">
                      <p className="text-muted">
                        <span className="font-medium text-ink">{item.clientName}</span>{" "}
                        {item.kind === "approved" ? "aprovou" : "pediu ajuste"} ·{" "}
                        {format(new Date(item.createdAt), "d MMM, HH:mm", { locale: ptBR })}
                      </p>
                      {item.message ? (
                        <p className="mt-1 whitespace-pre-wrap break-words text-ink">{item.message}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-line-subtle bg-base px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-8">
          {done ? (
            <p role="status" className="mb-3 flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              {done.kind === "approved"
                ? `Aprovação enviada. Obrigado, ${done.name}!`
                : `Pedido de ajuste enviado. A equipe já foi avisada, ${done.name}.`}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}

          {step === "identify" ? (
            <IdentityForm
              initial={identity}
              onCancel={() => setStep("idle")}
              onSubmit={(value) => {
                saveIdentity(value);
                setIdentity(value);
                setStep(after);
              }}
            />
          ) : step === "approve" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink">
                Aprovar <span className="font-medium">“{task.title}”</span>?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <ActionButton variant="ghost" disabled={busy} onClick={() => setStep("idle")}>
                  Voltar
                </ActionButton>
                <ActionButton variant="approve" disabled={busy} onClick={() => void send("approved")}>
                  {busy ? "Enviando…" : "Confirmar"}
                </ActionButton>
              </div>
              <IdentityLine identity={identity} onChange={() => { setAfter("approve"); setStep("identify"); }} />
            </div>
          ) : step === "changes" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (message.trim()) void send("changes_requested");
              }}
            >
              <label htmlFor="client-changes" className="text-sm font-medium text-ink">
                O que precisa mudar?
              </label>
              <textarea
                id="client-changes"
                autoFocus
                required
                rows={4}
                maxLength={MAX_MESSAGE}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onFocus={(event) => {
                  const field = event.currentTarget;
                  window.setTimeout(() => field.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
                }}
                placeholder="Ex.: trocar a foto da capa e deixar o título mais curto."
                className="w-full resize-none rounded-2xl border border-line bg-elevated px-4 py-3 text-base text-ink outline-none placeholder:text-faint focus:border-ink sm:text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <ActionButton variant="ghost" disabled={busy} onClick={() => setStep("idle")}>
                  Voltar
                </ActionButton>
                <ActionButton type="submit" variant="changes" disabled={busy || !message.trim()}>
                  {busy ? "Enviando…" : "Enviar pedido"}
                </ActionButton>
              </div>
              <IdentityLine identity={identity} onChange={() => { setAfter("changes"); setStep("identify"); }} />
            </form>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <ActionButton variant="ghost" onClick={() => start("changes")}>
                Solicitar ajuste
              </ActionButton>
              <ActionButton
                variant="approve"
                disabled={task.approvalStatus === "approved"}
                onClick={() => start("approve")}
              >
                {task.approvalStatus === "approved" ? "Aprovado" : "Aprovar"}
              </ActionButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">{title}</h3>
      {children}
    </section>
  );
}

function ActionButton({
  variant,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant: "approve" | "changes" | "ghost" }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "approve" && "bg-emerald-600 text-white hover:bg-emerald-700",
        variant === "changes" && "bg-ink text-base hover:opacity-90",
        variant === "ghost" && "border border-line text-ink hover:bg-hover",
        className,
      )}
    />
  );
}

function IdentityLine({ identity, onChange }: { identity: ClientIdentity | null; onChange: () => void }) {
  if (!identity) return null;
  return (
    <p className="text-center text-xs text-faint">
      Respondendo como <span className="font-medium text-muted">{identity.clientName}</span> ·{" "}
      <button type="button" onClick={onChange} className="underline underline-offset-2 hover:text-ink">
        não é você?
      </button>
    </p>
  );
}

function IdentityForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: ClientIdentity | null;
  onCancel: () => void;
  onSubmit: (identity: ClientIdentity) => void;
}) {
  const [name, setName] = useState(initial?.clientName ?? "");
  const [email, setEmail] = useState(initial?.clientEmail ?? "");
  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !emailOk) return;
        onSubmit({ clientName: name.trim().slice(0, 80), clientEmail: email.trim() || undefined });
      }}
    >
      <p className="text-sm text-muted">Antes de responder, diga quem é você. Só pedimos uma vez.</p>
      <input
        autoFocus
        required
        maxLength={80}
        autoComplete="name"
        aria-label="Seu nome"
        placeholder="Seu nome"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="h-12 rounded-2xl border border-line bg-elevated px-4 text-base text-ink outline-none placeholder:text-faint focus:border-ink sm:text-sm"
      />
      <input
        type="email"
        maxLength={200}
        autoComplete="email"
        inputMode="email"
        aria-label="Seu e-mail (opcional)"
        placeholder="Seu e-mail (opcional)"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="h-12 rounded-2xl border border-line bg-elevated px-4 text-base text-ink outline-none placeholder:text-faint focus:border-ink sm:text-sm"
      />
      {!emailOk ? <p className="text-xs text-red-600 dark:text-red-400">Confira o e-mail.</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <ActionButton variant="ghost" onClick={onCancel}>
          Voltar
        </ActionButton>
        <ActionButton type="submit" variant="changes" disabled={!name.trim() || !emailOk}>
          Continuar
        </ActionButton>
      </div>
    </form>
  );
}
