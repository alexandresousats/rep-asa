export type MovableTask = {
  id: string;
  section: string;
  parentId?: string | null;
  order?: number;
};

export type SectionTransfer = {
  sourceId: string;
  section: string;
  orderedIds: string[];
  order: number;
  childIds: string[];
};

export function rootIdsInSection<T extends MovableTask>(tasks: T[], section: string): string[] {
  return tasks
    .filter((task) => task.section === section && !task.parentId)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((task) => task.id);
}

/** Same-section list reorder. `targetId` is the row dropped on; null appends. */
export function moveWithinSection(
  ids: string[],
  sourceId: string,
  targetId: string | null,
): string[] | null {
  if (!sourceId) return null;
  if (targetId) {
    if (sourceId === targetId) return null;
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return null;
    const next = [...ids];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  }
  const from = ids.indexOf(sourceId);
  if (from < 0 || from === ids.length - 1) return null;
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.push(item);
  return next;
}

/**
 * Where a task lands when dropped on another section.
 * `beforeId` is the root task to insert before; null appends (including an empty section).
 */
export function planSectionTransfer<T extends MovableTask>(
  tasks: T[],
  sourceId: string,
  section: string,
  beforeId: string | null,
): SectionTransfer | null {
  const source = tasks.find((task) => task.id === sourceId);
  if (!source || source.parentId || source.section === section) return null;
  const ids = rootIdsInSection(tasks, section).filter((id) => id !== sourceId);
  let index = ids.length;
  if (beforeId) {
    const at = ids.indexOf(beforeId);
    if (at >= 0) index = at;
  }
  const orderedIds = [...ids];
  orderedIds.splice(index, 0, sourceId);
  return {
    sourceId,
    section,
    orderedIds,
    order: index,
    childIds: descendantIds(tasks, sourceId, section),
  };
}

/** Insertion point for a row, using the pointer's half of that row. */
export function beforeIdForRow(ids: string[], overId: string, after: boolean): string | null {
  const index = ids.indexOf(overId);
  if (index < 0) return null;
  if (!after) return overId;
  return ids[index + 1] ?? null;
}

/** Drop on the section chrome, outside a task row. */
export function sectionEdgeTarget(ids: string[], edge: "start" | "end") {
  if (edge === "end") return { overTaskId: null as string | null, beforeId: null as string | null };
  const first = ids[0] ?? null;
  return { overTaskId: first, beforeId: first };
}

function descendantIds<T extends MovableTask>(tasks: T[], sourceId: string, section: string) {
  const ids: string[] = [];
  const pending = [sourceId];
  const seen = new Set<string>([sourceId]);
  while (pending.length > 0) {
    const parentId = pending.shift();
    if (!parentId) break;
    for (const task of tasks) {
      if (task.parentId !== parentId || seen.has(task.id)) continue;
      seen.add(task.id);
      pending.push(task.id);
      if (task.section !== section) ids.push(task.id);
    }
  }
  return ids;
}
