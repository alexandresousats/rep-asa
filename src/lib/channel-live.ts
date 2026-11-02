import type { Channel, ChannelMessage } from "./types";

export type ChannelLiveEvent =
  | { kind: "channel"; channel: Channel }
  | { kind: "channels"; channels: Channel[] }
  | { kind: "channel-removed"; channelId: string }
  | { kind: "channel-message"; message: ChannelMessage }
  | { kind: "channel-message-removed"; channelId: string; messageId: string };

const listeners = new Set<(event: ChannelLiveEvent) => void>();

export function emitChannelLive(event: ChannelLiveEvent) {
  for (const listener of listeners) listener(event);
}

export function subscribeChannelLive(listener: (event: ChannelLiveEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
