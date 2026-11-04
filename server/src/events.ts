export type LiveEvent =
  | { workspaceId: string; kind: "task"; task: unknown }
  | { workspaceId: string; kind: "task-removed"; taskId: string }
  | { workspaceId: string | null; kind: "notification"; userId: string }
  | { workspaceId: string; kind: "channel"; channel: unknown }
  | { workspaceId: string; kind: "channels"; channels: unknown }
  | { workspaceId: string; kind: "channel-removed"; channelId: string }
  | { workspaceId: string; kind: "channel-message"; message: unknown }
  | { workspaceId: string; kind: "channel-message-removed"; channelId: string; messageId: string }
  | { workspaceId: string; kind: "presence"; userIds: string[] }
  | { workspaceId: string; kind: "direct"; audience: string[]; conversation: unknown }
  | { workspaceId: string; kind: "direct-message"; audience: string[]; message: unknown }
  | {
      workspaceId: string;
      kind: "direct-message-removed";
      audience: string[];
      conversationId: string;
      messageId: string;
    }
  | { workspaceId: string; kind: "direct-removed"; audience: string[]; conversationId: string };

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

const DIRECT_KINDS = new Set<LiveEvent["kind"]>([
  "direct",
  "direct-message",
  "direct-message-removed",
  "direct-removed",
]);

export function isDirectLive(
  event: LiveEvent,
): event is Extract<
  LiveEvent,
  { kind: "direct" | "direct-message" | "direct-message-removed" | "direct-removed" }
> {
  return DIRECT_KINDS.has(event.kind);
}

export function deliversLiveEvent(
  actor: { id: string; workspaceId: string | null; access: string },
  event: LiveEvent,
) {
  if (event.kind === "notification") return event.userId === actor.id;
  if (!actor.workspaceId || event.workspaceId !== actor.workspaceId) return false;
  if (isDirectLive(event)) {
    return actor.access !== "cliente" && event.audience.includes(actor.id);
  }
  if ((isChannelLive(event) || event.kind === "presence") && actor.access === "cliente") return false;
  return true;
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
