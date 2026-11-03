import type { DirectConversation, DirectMessage } from "./types";

export type DirectLiveEvent =
  | { kind: "direct"; audience: string[]; conversation: DirectConversation }
  | { kind: "direct-message"; audience: string[]; message: DirectMessage }
  | {
      kind: "direct-message-removed";
      audience: string[];
      conversationId: string;
      messageId: string;
    }
  | { kind: "direct-removed"; audience: string[]; conversationId: string };

const listeners = new Set<(event: DirectLiveEvent) => void>();

export function emitDirectLive(event: DirectLiveEvent) {
  for (const listener of listeners) listener(event);
}

export function subscribeDirectLive(listener: (event: DirectLiveEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
