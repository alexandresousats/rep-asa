"use client";

import { AlertCircle, Check, LoaderCircle, Sparkles, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { ChatMessage, ChatToolStep } from "@/lib/types";
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
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
        step.status === "error"
          ? "border-red-400/30 text-red-400"
          : "border-line-subtle bg-elevated text-muted",
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

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-elevated px-5 py-3 text-[15px] leading-7 text-ink">
          {message.content}
        </div>
      </div>
    );
  }
  const typing = message.pending && !message.content && message.steps.length === 0;
  return (
    <div className="flex gap-4">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-ink">
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
  const endRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const root = rootRef.current?.closest("[data-chat-scroll]") as HTMLElement | null;
    if (!root) return;
    function onScroll() {
      if (!root) return;
      stick.current = root.scrollHeight - root.scrollTop - root.clientHeight < 120;
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
        <Bubble key={message.id} message={message} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
