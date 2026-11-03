const listeners = new Set<(ids: string[]) => void>();
let onlineIds: string[] = [];

export function emitPresence(userIds: string[]) {
  onlineIds = userIds;
  for (const listener of listeners) listener(onlineIds);
}

export function subscribePresence(listener: (ids: string[]) => void) {
  listeners.add(listener);
  listener(onlineIds);
  return () => {
    listeners.delete(listener);
  };
}
