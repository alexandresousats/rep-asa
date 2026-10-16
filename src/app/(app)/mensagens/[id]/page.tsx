"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { MessageInbox } from "@/components/messages/message-inbox";
import { useAppStore } from "@/lib/store";

export default function MessageThreadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const allThreads = useAppStore((state) => state.threads);
  const threads = useMemo(
    () =>
      [...allThreads].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    [allThreads],
  );
  const messages = useAppStore((state) => state.messages);
  const users = useAppStore((state) => state.users);

  return (
    <MessageInbox
      threads={threads}
      messages={messages}
      users={users}
      activeId={params.id}
      onSelect={(id) => router.push(`/mensagens/${id}`)}
    />
  );
}
