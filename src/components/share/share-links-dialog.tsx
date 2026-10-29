"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Copy, Dices, ExternalLink, Eye, EyeOff, Globe, Link2, Lock, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  createShareLink,
  listShareLinks,
  regenerateShareLink,
  revokeShareLink,
  updateShareLink,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import type { ShareLink, ShareVisibility } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";

const PIN = /^\d{4}$/;
const EXPIRY_OPTIONS = [
  { id: "never", label: "Nunca expira" },
  { id: "7", label: "7 dias" },
  { id: "30", label: "30 dias" },
  { id: "90", label: "90 dias" },
  { id: "date", label: "Escolher data" },
] as const;

type Expiry = (typeof EXPIRY_OPTIONS)[number]["id"];
type Reveal = { label: string; url: string; pin: string | null };
type Confirm = { kind: "revoke" | "regenerate"; link: ShareLink };
type PinEdit = { link: ShareLink; makePrivate: boolean };

function shareUrl(token: string) {
  return `${window.location.origin}/c/${token}`;
}

function randomPin() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(value[0] % 10_000).padStart(4, "0");
}

function expiryValue(expiry: Expiry, date: string) {
  if (expiry === "never") return null;
  if (expiry === "date") return new Date(`${date}T23:59:59`).toISOString();
  return new Date(Date.now() + Number(expiry) * 24 * 60 * 60 * 1000).toISOString();
}

function shortDate(iso: string) {
  return format(new Date(iso), "d 'de' MMM yyyy", { locale: ptBR });
}

function isActive(link: ShareLink) {
  if (link.revokedAt) return false;
  return !link.expiresAt || new Date(link.expiresAt).getTime() > Date.now();
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareLinksDialog({
  open,
  projectId,
  onClose,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
}) {
  const users = useWorkspace((state) => state.users);
  const { show, node: toast } = useToast();
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [pinEdit, setPinEdit] = useState<PinEdit | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      listShareLinks(projectId).then(
        (rows) => {
          setLinks(rows);
          setLoadError("");
          setLoading(false);
        },
        (reason: unknown) => {
          setLoadError(
            reason instanceof Error ? reason.message : "Não foi possível carregar os links.",
          );
          setLoading(false);
        },
      ),
    [projectId],
  );

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function close() {
    if (busy) return;
    setCreating(false);
    setReveal(null);
    setConfirm(null);
    setPinEdit(null);
    onClose();
  }

  async function act<T>(work: () => Promise<T>, success: string) {
    setBusy(true);
    try {
      const result = await work();
      show(success);
      await load();
      return result;
    } catch (reason) {
      show(reason instanceof Error ? reason.message : "Não foi possível concluir.", "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function copyAndTell(text: string, what: string) {
    if (await copy(text)) show(`${what} copiado.`);
    else show("Não foi possível copiar. Selecione e copie manualmente.", "error");
  }

  const active = links.filter(isActive);
  const creatorName = (id: string) => users.find((user) => user.id === id)?.name ?? "Alguém do time";

  let body: React.ReactNode;
  if (reveal) {
    body = (
      <RevealPanel
        reveal={reveal}
        onCopy={copyAndTell}
        onDone={() => setReveal(null)}
      />
    );
  } else if (creating) {
    body = (
      <CreateForm
        busy={busy}
        onCancel={() => setCreating(false)}
        onSubmit={async (input, label) => {
          const created = await act(() => createShareLink(projectId, input), "Link criado.");
          if (!created) return;
          setCreating(false);
          setReveal({ label, url: shareUrl(created.token), pin: input.pin ?? null });
        }}
      />
    );
  } else if (pinEdit) {
    body = (
      <PinEditForm
        edit={pinEdit}
        busy={busy}
        onCancel={() => setPinEdit(null)}
        onSubmit={async (pin) => {
          const updated = await act(
            () =>
              updateShareLink(projectId, pinEdit.link.id, {
                pin,
                ...(pinEdit.makePrivate ? { visibility: "private" as const } : {}),
              }),
            pinEdit.makePrivate ? "Link agora é privado." : "PIN trocado.",
          );
          if (!updated) return;
          setPinEdit(null);
          setReveal({ label: updated.label, url: "", pin });
        }}
      />
    );
  } else {
    body = (
      <>
        <p className="text-sm leading-6 text-faint">
          O cliente vê só as tarefas deste projeto, sem subtarefas, sem responsáveis e sem comentários
          internos. Ele pode aprovar ou pedir ajuste em cada tarefa.
        </p>
        <Button type="button" className="mt-4 w-full sm:w-auto" onClick={() => setCreating(true)}>
          <Link2 className="h-4 w-4" />
          Criar link
        </Button>
        <div className="mt-6">
          <h3 className="text-xs font-medium uppercase tracking-wide text-faint">Links ativos</h3>
          {loading ? (
            <div className="mt-3 h-20 animate-pulse rounded-2xl bg-hover" />
          ) : loadError ? (
            <p className="mt-3 text-sm text-red-400">{loadError}</p>
          ) : active.length === 0 ? (
            <p className="mt-3 text-sm text-faint">Nenhum link ativo ainda.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {active.map((link) => (
                <LinkRow
                  key={link.id}
                  link={link}
                  creator={creatorName(link.createdById)}
                  busy={busy}
                  onChangePin={() => setPinEdit({ link, makePrivate: false })}
                  onMakePrivate={() => setPinEdit({ link, makePrivate: true })}
                  onMakePublic={() =>
                    void act(
                      () => updateShareLink(projectId, link.id, { visibility: "public" }),
                      "Link agora é público.",
                    )
                  }
                  onRegenerate={() => setConfirm({ kind: "regenerate", link })}
                  onRevoke={() => setConfirm({ kind: "revoke", link })}
                />
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <Dialog
        open={open}
        title="Compartilhar via link"
        onClose={close}
        className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto max-sm:p-5"
      >
        {body}
      </Dialog>
      <Dialog
        open={confirm !== null}
        title={confirm?.kind === "revoke" ? "Revogar link" : "Regenerar link"}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
      >
        <p className="text-sm leading-6 text-faint">
          {confirm?.kind === "revoke"
            ? "O link para de funcionar na hora e quem estiver com a página aberta perde o acesso."
            : "O link atual para de funcionar na hora e um novo é criado com as mesmas configurações. Envie o novo link ao cliente."}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={busy}
            className={confirm?.kind === "revoke" ? "!bg-red-500 !text-white" : undefined}
            onClick={async () => {
              if (!confirm) return;
              const { kind, link } = confirm;
              if (kind === "revoke") {
                const done = await act(() => revokeShareLink(projectId, link.id), "Link revogado.");
                if (done) setConfirm(null);
                return;
              }
              const fresh = await act(
                () => regenerateShareLink(projectId, link.id),
                "Novo link criado.",
              );
              if (!fresh) return;
              setConfirm(null);
              setReveal({ label: fresh.label, url: shareUrl(fresh.token), pin: null });
            }}
          >
            {confirm?.kind === "revoke" ? "Revogar" : "Regenerar"}
          </Button>
        </div>
      </Dialog>
      {open ? toast : null}
    </>
  );
}

function LinkRow({
  link,
  creator,
  busy,
  onChangePin,
  onMakePrivate,
  onMakePublic,
  onRegenerate,
  onRevoke,
}: {
  link: ShareLink;
  creator: string;
  busy: boolean;
  onChangePin: () => void;
  onMakePrivate: () => void;
  onMakePublic: () => void;
  onRegenerate: () => void;
  onRevoke: () => void;
}) {
  const isPrivate = link.visibility === "private";
  return (
    <li className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-ink">
          {link.label || "Link sem nome"}
        </span>
        <VisibilityBadge visibility={link.visibility} hasPin={link.hasPin} />
      </div>
      <p className="mt-1.5 text-xs leading-5 text-faint">
        Criado por {creator} em {shortDate(link.createdAt)} ·{" "}
        {link.expiresAt ? `expira em ${shortDate(link.expiresAt)}` : "não expira"}
        <br />
        {link.lastAccessAt
          ? `Último acesso em ${shortDate(link.lastAccessAt)} · ${link.accessCount} ${link.accessCount === 1 ? "acesso" : "acessos"}`
          : "Ainda não foi aberto"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {isPrivate ? (
          <>
            <RowButton disabled={busy} onClick={onChangePin}>
              Trocar PIN
            </RowButton>
            <RowButton disabled={busy} onClick={onMakePublic}>
              Tornar público
            </RowButton>
          </>
        ) : (
          <RowButton disabled={busy} onClick={onMakePrivate}>
            Tornar privado
          </RowButton>
        )}
        <RowButton disabled={busy} onClick={onRegenerate}>
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerar
        </RowButton>
        <RowButton disabled={busy} onClick={onRevoke} danger>
          Revogar
        </RowButton>
      </div>
    </li>
  );
}

function RowButton({
  children,
  onClick,
  disabled,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium hover:bg-hover disabled:opacity-40",
        danger ? "text-red-400" : "text-ink",
      )}
    >
      {children}
    </button>
  );
}

function VisibilityBadge({ visibility, hasPin }: { visibility: ShareVisibility; hasPin: boolean }) {
  const isPrivate = visibility === "private";
  const Icon = isPrivate ? Lock : Globe;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        isPrivate
          ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
      )}
    >
      <Icon className="h-3 w-3" />
      {isPrivate ? (hasPin ? "Privado · PIN definido" : "Privado") : "Público"}
    </span>
  );
}

function CreateForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (
    input: { label: string; expiresAt: string | null; visibility: ShareVisibility; pin?: string },
    label: string,
  ) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState<Expiry>("never");
  const [date, setDate] = useState("");
  const [visibility, setVisibility] = useState<ShareVisibility>("public");
  const [pin, setPin] = useState("");
  const [today] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const isPrivate = visibility === "private";
  const pinOk = !isPrivate || PIN.test(pin);
  const dateOk = expiry !== "date" || (date !== "" && date >= today);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!pinOk || !dateOk) return;
        void onSubmit(
          {
            label: label.trim(),
            expiresAt: expiryValue(expiry, date),
            visibility,
            ...(isPrivate ? { pin } : {}),
          },
          label.trim(),
        );
      }}
      className="flex flex-col gap-5"
    >
      <Input
        id="share-label"
        label="Nome do link (opcional)"
        placeholder="Ex.: Cliente Pulse"
        maxLength={80}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
      />
      <div className="flex flex-col gap-2 text-sm text-muted">
        <span>Expiração</span>
        <div className="flex flex-wrap gap-2">
          {EXPIRY_OPTIONS.map((option) => (
            <Choice key={option.id} active={expiry === option.id} onClick={() => setExpiry(option.id)}>
              {option.label}
            </Choice>
          ))}
        </div>
        {expiry === "date" ? (
          <input
            type="date"
            aria-label="Data de expiração"
            value={date}
            min={today}
            onChange={(event) => setDate(event.target.value)}
            className="h-11 rounded-2xl border border-line bg-elevated px-4 text-sm text-ink outline-none focus:border-ink"
          />
        ) : null}
      </div>
      <fieldset className="flex flex-col gap-2 text-sm text-muted">
        <legend className="mb-2">Acesso</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <AccessOption
            active={!isPrivate}
            icon={Globe}
            title="Público"
            text="Quem tiver o link acessa."
            onClick={() => setVisibility("public")}
          />
          <AccessOption
            active={isPrivate}
            icon={Lock}
            title="Privado"
            text="O cliente precisa digitar um PIN."
            onClick={() => setVisibility("private")}
          />
        </div>
      </fieldset>
      {isPrivate ? <PinField value={pin} onChange={setPin} /> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy || !pinOk || !dateOk}>
          {busy ? "Criando…" : "Criar link"}
        </Button>
      </div>
    </form>
  );
}

function PinEditForm({
  edit,
  busy,
  onCancel,
  onSubmit,
}: {
  edit: PinEdit;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (pin: string) => Promise<void>;
}) {
  const [pin, setPin] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (PIN.test(pin)) void onSubmit(pin);
      }}
      className="flex flex-col gap-5"
    >
      <p className="text-sm leading-6 text-faint">
        {edit.makePrivate
          ? `Defina o PIN para tornar "${edit.link.label || "Link sem nome"}" privado.`
          : `Novo PIN para "${edit.link.label || "Link sem nome"}". O PIN antigo para de valer na hora.`}
      </p>
      <PinField value={pin} onChange={setPin} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy || !PIN.test(pin)}>
          {busy ? "Salvando…" : "Salvar PIN"}
        </Button>
      </div>
    </form>
  );
}

function PinField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(true);
  return (
    <div className="flex flex-col gap-2 text-sm text-muted">
      <label htmlFor="share-pin">PIN de 4 dígitos</label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            id="share-pin"
            type={visible ? "text" : "password"}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={4}
            value={value}
            onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
            className="h-11 w-36 rounded-2xl border border-line bg-elevated px-4 pr-11 font-mono text-lg tracking-[0.4em] text-ink outline-none focus:border-ink"
          />
          <button
            type="button"
            aria-label={visible ? "Ocultar PIN" : "Mostrar PIN"}
            onClick={() => setVisible((current) => !current)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-2 text-faint hover:bg-hover hover:text-ink"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(randomPin())}>
          <Dices className="h-4 w-4" />
          Gerar PIN aleatório
        </Button>
      </div>
      <p className="text-xs leading-5 text-faint">
        Trocar o PIN ou tornar o link privado desconecta quem já está com a página aberta.
      </p>
    </div>
  );
}

function RevealPanel({
  reveal,
  onCopy,
  onDone,
}: {
  reveal: Reveal;
  onCopy: (text: string, what: string) => Promise<void>;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {reveal.url ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">
            Link {reveal.label ? `"${reveal.label}"` : "do cliente"}
          </span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={reveal.url}
              onFocus={(event) => event.target.select()}
              className="h-11 min-w-0 flex-1 rounded-2xl border border-line bg-base px-4 font-mono text-xs text-ink outline-none"
            />
            <Button type="button" onClick={() => void onCopy(reveal.url, "Link")}>
              <Copy className="h-4 w-4" />
              Copiar
            </Button>
          </div>
          <p className="text-xs leading-5 text-amber-600 dark:text-amber-300">
            Guarde o link agora: por segurança, ele só aparece completo nesta tela.
          </p>
          <a
            href={reveal.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-ink underline-offset-4 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir prévia
          </a>
        </div>
      ) : null}
      {reveal.pin ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted">PIN</span>
          <div className="flex items-center gap-2">
            <span className="rounded-2xl border border-line bg-base px-4 py-2 font-mono text-lg tracking-[0.4em] text-ink">
              {reveal.pin}
            </span>
            <Button type="button" variant="outline" onClick={() => void onCopy(reveal.pin!, "PIN")}>
              <Copy className="h-4 w-4" />
              Copiar PIN
            </Button>
          </div>
          <p className="text-xs leading-5 text-faint">
            Envie o PIN ao cliente separado do link, por exemplo em outra mensagem ou outro canal.
          </p>
        </div>
      ) : null}
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onDone}>
          Concluir
        </Button>
      </div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-3 text-xs font-medium",
        active ? "border-ink bg-ink text-base" : "border-line text-ink hover:bg-hover",
      )}
    >
      {children}
    </button>
  );
}

function AccessOption({
  active,
  icon: Icon,
  title,
  text,
  onClick,
}: {
  active: boolean;
  icon: typeof Globe;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-3 text-left",
        active ? "border-ink bg-hover" : "border-line hover:bg-hover",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink" />
      <span>
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs leading-5 text-faint">{text}</span>
      </span>
    </button>
  );
}
