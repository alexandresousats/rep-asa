"use client";

import { AlertCircle, Bot, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatThread } from "@/components/chat/chat-thread";
import { askAssistant } from "@/lib/api";
import { useChat } from "@/lib/chat";
import { agentReady, usePrefs } from "@/lib/prefs";
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
  const agent = usePrefs((state) => state.agent);
  const isAgentConfigured = agentReady(agent);

  const chatMessages = useChat((state) => state.messages);
  const resetChat = useChat((state) => state.reset);

  const [prompt, setPrompt] = useState("");
  const [offlineMessages, setOfflineMessages] = useState<AssistantReply[]>([
    {
      id: "welcome",
      role: "assistant",
      body: "Sou o assistente do ASA. Pergunte sobre atrasos, prazos da semana ou o desempenho da equipe.",
      createdAt: new Date().toISOString(),
    },
  ]);

  function sendOffline(text: string) {
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
    setOfflineMessages((current) => [...current, userMessage, reply]);
    setPrompt("");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-line bg-base shadow-2xl">
      <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <Sparkles className="h-4 w-4" strokeWidth={1.5} />
          {isAgentConfigured ? "Agente ASA" : "Assistente ASA"}
        </div>
        <div className="flex items-center gap-2">
          {isAgentConfigured && chatMessages.length > 0 ? (
            <button
              type="button"
              onClick={resetChat}
              className="text-xs text-faint hover:text-ink transition-colors"
            >
              Limpar conversa
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-faint hover:bg-hover hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isAgentConfigured && (
        <div className="flex items-center justify-between gap-2 border-b border-line-subtle bg-elevated/70 px-4 py-2.5 text-xs text-muted">
          <span>Conecte sua API Key para criar tarefas por chat.</span>
          <Link
            href="/configuracoes?tab=agente"
            onClick={onClose}
            className="shrink-0 font-medium text-ink underline underline-offset-2 hover:opacity-80"
          >
            Configurar
          </Link>
        </div>
      )}

      {isAgentConfigured ? (
        <>
          <div data-chat-scroll className="flex-1 overflow-y-auto px-5 py-5">
            {chatMessages.length === 0 ? (
              <div className="my-auto flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-ink">
                  <Bot className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <p className="mt-3 text-sm font-medium text-ink">Agente pronto</p>
                <p className="mt-1 max-w-[240px] text-xs text-faint">
                  Peça para criar tarefas, checar prazos ou organizar seus projetos.
                </p>
              </div>
            ) : (
              <ChatThread messages={chatMessages} />
            )}
          </div>
          <div className="border-t border-line-subtle p-4">
            <ChatComposer autoFocus />
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {offlineMessages.map((message) => (
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
                  onClick={() => sendOffline(item)}
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
                sendOffline(prompt);
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
        </>
      )}
    </div>
  );
}

