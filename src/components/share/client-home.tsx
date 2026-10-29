"use client";

import type { PublicTask } from "@/lib/api/public-share";
import { EmptyMonth } from "./client-calendar";

export function ClientHome({
  month,
  tasks,
  onSeeCalendar,
}: {
  month: Date;
  tasks: PublicTask[];
  onSeeCalendar: () => void;
}) {
  if (tasks.length === 0) return <EmptyMonth month={month} />;
  return (
    <button
      type="button"
      onClick={onSeeCalendar}
      className="w-full rounded-3xl border border-line bg-elevated p-6 text-left"
    >
      <p className="text-3xl font-semibold text-ink">{tasks.length}</p>
      <p className="mt-1 text-sm text-muted">tarefas neste mês</p>
    </button>
  );
}
