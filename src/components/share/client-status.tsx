import type { PublicTask } from "@/lib/api/public-share";
import { cn } from "@/lib/cn";

export type ClientStatusKey = "pending" | "approved" | "changes" | "done" | "progress";

const STATUS: Record<ClientStatusKey, { label: string; className: string; dot: string }> = {
  pending: {
    label: "Aguardando aprovação",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  approved: {
    label: "Aprovado",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  changes: {
    label: "Ajuste solicitado",
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  done: {
    label: "Concluída",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500",
  },
  progress: {
    label: "Em produção",
    className: "bg-neutral-500/15 text-muted",
    dot: "bg-neutral-400",
  },
};

// O que o cliente precisa saber primeiro é a aprovação; o andamento vem depois.
export function clientStatus(task: Pick<PublicTask, "approvalStatus" | "status">): ClientStatusKey {
  if (task.approvalStatus === "pending") return "pending";
  if (task.approvalStatus === "approved") return "approved";
  if (task.approvalStatus === "changes_requested") return "changes";
  return task.status === "done" ? "done" : "progress";
}

export function statusDot(key: ClientStatusKey) {
  return STATUS[key].dot;
}

export function StatusBadge({
  task,
  className,
}: {
  task: Pick<PublicTask, "approvalStatus" | "status">;
  className?: string;
}) {
  const meta = STATUS[clientStatus(task)];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none",
        meta.className,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
