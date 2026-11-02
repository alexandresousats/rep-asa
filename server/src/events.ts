export type LiveEvent =
  | { workspaceId: string; kind: "task"; task: unknown }
  | { workspaceId: string; kind: "task-removed"; taskId: string }
  | { workspaceId: string | null; kind: "notification"; userId: string }
  | { workspaceId: string; kind: "channel"; channel: unknown }
  | { workspaceId: string; kind: "channels"; channels: unknown }
  | { workspaceId: string; kind: "channel-removed"; channelId: string }
  | { workspaceId: string; kind: "channel-message"; message: unknown }
  | { workspaceId: string; kind: "channel-message-removed"; channelId: string; messageId: string };

const CHANNEL_KINDS = new Set<LiveEvent["kind"]>([
  "channel",
  "channels",
  "channel-removed",
  "channel-message",
  "channel-message-removed",
]);

export function isChannelLive(event: LiveEvent) {
  return CHANNEL_KINDS.has(event.kind);
}

type Listener = (event: LiveEvent) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publish(event: LiveEvent) {
  for (const listener of listeners) listener(event);
}
