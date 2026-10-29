"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { PublicTask } from "@/lib/api/public-share";
import { parseDate } from "@/lib/dates";
import { StatusBadge } from "./client-status";

export function ClientCalendar({ month, tasks }: { month: Date; tasks: PublicTask[] }) {
  if (tasks.length === 0) return <EmptyMonth month={month} />;
  return (
    <ul className="flex flex-col gap-3">
      {tasks.map((task) => (
        <li key={task.id} className="rounded-2xl border border-line bg-elevated p-4">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium text-ink">{task.title}</span>
            <StatusBadge task={task} />
          </div>
          {task.dueDate ? (
            <p className="mt-1 text-xs text-muted">
              Entrega {format(parseDate(task.dueDate), "d 'de' MMMM", { locale: ptBR })}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function EmptyMonth({ month }: { month: Date }) {
  return (
    <div className="rounded-3xl border border-dashed border-line px-6 py-14 text-center">
      <p className="text-base font-medium text-ink">Nada programado neste mês</p>
      <p className="mt-1 text-sm text-muted">
        Não há tarefas em {format(month, "MMMM", { locale: ptBR })}. Use as setas para ver outros meses.
      </p>
    </div>
  );
}
