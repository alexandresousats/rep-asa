"use client";

import { useParams, useSearchParams } from "next/navigation";
import { ChannelRoom } from "@/components/messages/channel-room";

const PEER = /^[A-Za-z0-9_-]{1,40}$/;

export function DirectMessagePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const raw = search.get("com") ?? "";
  const draftPeerId = id === "novo" && PEER.test(raw) ? raw : undefined;
  return (
    <ChannelRoom
      directId={id === "novo" ? undefined : id}
      draftPeerId={draftPeerId}
      startDraft={id === "novo" && !draftPeerId}
    />
  );
}
