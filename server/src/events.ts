export type LiveEvent =
  | { workspaceId: string; kind: "task"; task: unknown }
  | { workspaceId: string; kind: "task-removed"; taskId: string }
  | { workspaceId: string | null; kind: "notification"; userId: string };

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
