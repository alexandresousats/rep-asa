"use client";

import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { askAssistant } from "@/lib/api";
import type { AssistantReply } from "@/lib/types";

const SUGGESTIONS = [
  "Quais tarefas estão atrasadas?",
  "O que vence esta semana?",
  "Como está o desempenho da equipe?",
];

export function AssistantPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<AssistantReply[]>([
    {
      id: "welcome",
      role: "assistant",
      body: "Sou o assistente do ASA. Pergunte sobre atrasos, prazos da semana ou o desempenho da equipe.",
      createdAt: new Date().toISOString(),
    },
  ]);

  function send(text: string) {
    const value = text.trim();
    if (!value) return;
    const userMessage: AssistantReply = {
      id: `u-${Date.now()}`,
      role: "user",
      body: value,
      createdAt: new Date().toISOString(),
    };
    const reply: AssistantReply = {
      id: `a-${Date.now()}`,
      role: "assistant",
      body: askAssistant(value),
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage, reply]);
    setPrompt("");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-line bg-base">
      <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
        <div className="flex items-center gap-2 text-sm text-ink">
          <Sparkles className="h-4 w-4" strokeWidth={1.5} />
          Assistente ASA
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-faint hover:bg-hover hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "user"
                ? "ml-8 rounded-2xl bg-elevated px-4 py-3 text-sm text-ink"
                : "mr-8 whitespace-pre-wrap text-sm leading-6 text-muted"
            }
          >
            {message.body}
          </div>
        ))}
      </div>

      <div className="border-t border-line-subtle p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => send(item)}
              className="rounded-full border border-line px-3 py-1 text-xs text-faint hover:text-ink"
            >
              {item}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send(prompt);
          }}
        >
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Pergunte ao ASA"
            className="h-11 flex-1 rounded-full border border-line bg-elevated px-4 text-sm text-ink outline-none placeholder:text-faint"
          />
          <Button type="submit" size="sm">
            Enviar
          </Button>
        </form>
      </div>
    </div>
  );
}
