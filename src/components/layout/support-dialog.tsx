"use client";

import { Bug, Headphones, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { submitSupport } from "@/lib/api";

export type SupportKind = "ticket" | "bug" | "tecnico";

const COPY: Record<
  SupportKind,
  { title: string; intro: string; subject: string; subjectPlaceholder: string; message: string; messagePlaceholder: string }
> = {
  ticket: {
    title: "Abrir ticket",
    intro: "Conte o que você precisa. O suporte recebe o pedido com o e-mail da sua conta.",
    subject: "Assunto",
    subjectPlaceholder: "Ex.: não consigo convidar um membro",
    message: "Mensagem",
    messagePlaceholder: "Descreva o que aconteceu e o que você esperava.",
  },
  bug: {
    title: "Relatar bugs",
    intro: "Descreva o erro e, se souber, o caminho até ele aparecer.",
    subject: "O que quebrou",
    subjectPlaceholder: "Ex.: a tarefa some ao mover no kanban",
    message: "Como reproduzir",
    messagePlaceholder: "O que você fez, o que apareceu e o que deveria acontecer.",
  },
  tecnico: {
    title: "Suporte técnico",
    intro: "Para acesso, falha do sistema ou algo que trava o trabalho.",
    subject: "Assunto",
    subjectPlaceholder: "Ex.: a sessão cai no projeto",
    message: "Detalhes",
    messagePlaceholder: "Quando começou e se acontece sempre.",
  },
};

const CHOICES: { kind: SupportKind; label: string; icon: typeof Ticket }[] = [
  { kind: "ticket", label: "Abrir ticket", icon: Ticket },
  { kind: "bug", label: "Relatar bugs", icon: Bug },
  { kind: "tecnico", label: "Suporte técnico", icon: Headphones },
];

export function SupportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<SupportKind | null>(null);

  useEffect(() => {
    if (!open) setKind(null);
  }, [open]);

  function close() {
    setKind(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      title={kind ? COPY[kind].title : "Suporte"}
      onClose={close}
      className="overflow-hidden"
    >
      {kind ? (
        <SupportForm key={kind} kind={kind} onClose={close} onBack={() => setKind(null)} />
      ) : (
        <div className="flex flex-col gap-1">
          {CHOICES.map((choice) => {
            const Icon = choice.icon;
            return (
              <button
                key={choice.kind}
                type="button"
                onClick={() => setKind(choice.kind)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-ink hover:bg-hover"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.5} />
                <span>{choice.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

function SupportForm({
  kind,
  onClose,
  onBack,
}: {
  kind: SupportKind;
  onClose: () => void;
  onBack: () => void;
}) {
  const copy = COPY[kind];
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="space-y-5">
        <p className="text-sm leading-6 text-faint">
          Pedido enviado. O suporte recebe esta mensagem junto com o e-mail da sua conta.
        </p>
        <div className="flex justify-end">
          <Button type="button" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const nextSubject = subject.trim();
        const nextMessage = message.trim();
        if (nextSubject.length < 3) {
          setError("Informe um assunto.");
          return;
        }
        if (nextMessage.length < 10) {
          setError("Descreva o pedido com um pouco mais de detalhe.");
          return;
        }
        setSending(true);
        setError("");
        void submitSupport({
          kind,
          subject: nextSubject,
          message: nextMessage,
          page: window.location.pathname,
        }).then((result) => {
          setSending(false);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setSent(true);
        });
      }}
    >
      <p className="text-sm leading-6 break-words text-faint">{copy.intro}</p>
      <Input
        label={copy.subject}
        value={subject}
        maxLength={120}
        placeholder={copy.subjectPlaceholder}
        onChange={(event) => setSubject(event.target.value)}
      />
      <Textarea
        label={copy.message}
        value={message}
        maxLength={4000}
        placeholder={copy.messagePlaceholder}
        onChange={(event) => setMessage(event.target.value)}
      />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={sending} onClick={onBack}>
          Voltar
        </Button>
        <Button type="submit" disabled={sending}>
          Enviar
        </Button>
      </div>
    </form>
  );
}
