import { uid } from "./crypto";
import { publish } from "./events";

type Connection = { userId: string; workspaceId: string };

const connections = new Map<string, Connection>();

export function presenceUserIds(workspaceId: string) {
  const ids = new Set<string>();
  for (const connection of connections.values()) {
    if (connection.workspaceId === workspaceId) ids.add(connection.userId);
  }
  return [...ids];
}

function publishPresence(workspaceId: string) {
  publish({ workspaceId, kind: "presence", userIds: presenceUserIds(workspaceId) });
}

export function joinPresence(userId: string, workspaceId: string) {
  const id = uid("pr");
  connections.set(id, { userId, workspaceId });
  publishPresence(workspaceId);
  return id;
}

export function leavePresence(id: string) {
  const current = connections.get(id);
  if (!current) return;
  connections.delete(id);
  publishPresence(current.workspaceId);
}
