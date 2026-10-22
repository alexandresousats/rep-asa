"use client";

import { ArrowUp, Square } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useChat } from "@/lib/chat";
import { agentReady, usePrefs } from "@/lib/prefs";

export function ChatComposer({
  hero = false,
  autoFocus = false,
  className,
}: {
  hero?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const agent = usePrefs((state) => state.agent);
  const hydrated = usePrefs((state) => state.hasHydrated);
  const sending = useChat((state) => state.sending);
  const send = useChat((state) => state.send);
  const stop = useChat((state) => state.stop);
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const ready = agentReady(agent);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  function submit() {
    if (!value.trim() || sending || !ready) return;
    const text = value;
    setValue("");
    void send(text);
  }

  return (
    <div className={className}>
      <div
        className={cn(
          "flex items-end gap-2 border border-line bg-elevated transition-colors focus-within:border-muted",
          hero ? "rounded-[28px] p-3 pl-6" : "rounded-3xl p-2 pl-5",
        )}
      >
        <textarea
          ref={ref}
          rows={1}
          value={value}
          disabled={hydrated && !ready}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={
            hydrated && !ready
              ? "Conecte um agente nas configurações para conversar"
              : "Peça ao agente para criar uma tarefa…"
          }
          aria-label="Mensagem para o agente"
          className={cn(
            "max-h-[200px] flex-1 resize-none bg-transparent text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed",
            hero ? "py-2.5 text-base leading-6" : "py-2 text-sm leading-6",
          )}
        />
        {sending ? (
          <button
            type="button"
            onClick={stop}
            aria-label="Parar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-base hover:opacity-90"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim() || !ready}
            aria-label="Enviar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-base transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
          </button>
        )}
      </div>
      {hydrated && !ready ? (
        <p className="mt-3 text-center text-xs text-faint">
          <Link
            href="/configuracoes?tab=agente"
            className="text-muted underline underline-offset-2 hover:text-ink"
          >
            Conectar meu agente
          </Link>{" "}
          com uma chave de API.
        </p>
      ) : null}
    </div>
  );
}
