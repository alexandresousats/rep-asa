"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { MessageInbox } from "@/components/messages/message-inbox";
import { useAppStore } from "@/lib/store";

export default function MessagesPage() {
  const router = useRouter();
  const allThreads = useAppStore((state) => state.threads);
  const threads = useMemo(
    () =>
      [...allThreads].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    [allThreads],
  );
  const messages = useAppStore((state) => state.messages);
  const users = useAppStore((state) => state.users);
  const activeId = threads[0]?.id ?? null;

  return (
    <MessageInbox
      threads={threads}
      messages={messages}
      users={users}
      activeId={activeId}
      onSelect={(id) => router.push(`/mensagens/${id}`)}
    />
  );
}
