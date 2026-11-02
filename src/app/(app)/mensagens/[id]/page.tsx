"use client";

import { useParams } from "next/navigation";
import { ChannelRoom } from "@/components/messages/channel-room";

export default function ChannelPage() {
  const params = useParams<{ id: string }>();
  const channelId = typeof params.id === "string" ? params.id : undefined;
  return <ChannelRoom channelId={channelId} />;
}
