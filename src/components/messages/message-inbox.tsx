"use client";

import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { sendMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Message, MessageThread, User } from "@/lib/types";

export function MessageInbox({
  threads,
  messages,
  users,
  activeId,
  onSelect,
}: {
  threads: MessageThread[];
  messages: Message[];
  users: User[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [body, setBody] = useState("");
  const active = threads.find((thread) => thread.id === activeId) ?? threads[0];
  const threadMessages = messages.filter((message) => message.threadId === active?.id);

  return (
    <div className="flex h-full min-h-full">
      <aside className="w-full max-w-xs border-r border-line">
        <div className="px-5 py-5 text-sm text-ink">Mensagens</div>
        <div>
          {threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              onClick={() => onSelect(thread.id)}
              className={cn(
                "block w-full border-b border-line-subtle px-5 py-4 text-left hover:bg-hover",
                active?.id === thread.id && "bg-elevated",
              )}
            >
              <p className="text-sm text-ink">{thread.title}</p>
              <p className="mt-1 text-xs text-faint">
                {format(parseISO(thread.lastMessageAt), "d MMM · HH:mm", {
                  locale: ptBR,
                })}
              </p>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <div className="border-b border-line-subtle px-6 py-5 text-sm text-ink">
              {active.title}
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {threadMessages.map((message) => {
                const author = users.find((user) => user.id === message.authorId);
                return (
                  <div key={message.id} className="flex gap-3">
                    <Avatar initials={author?.initials ?? "?"} />
                    <div>
                      <p className="text-xs text-faint">
                        {author?.name} ·{" "}
                        {format(parseISO(message.createdAt), "d MMM HH:mm", {
                          locale: ptBR,
                        })}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-ink">{message.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <form
              className="flex gap-2 border-t border-line-subtle p-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!body.trim() || !active) return;
                sendMessage(active.id, body);
                setBody("");
              }}
            >
              <input
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Escrever mensagem"
                className="h-11 flex-1 rounded-full border border-line bg-elevated px-4 text-sm text-ink outline-none placeholder:text-faint"
              />
              <Button type="submit">Enviar</Button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-faint">
            Nenhuma conversa.
          </div>
        )}
      </section>
    </div>
  );
}
