import { cn } from "@/lib/cn";
import { PRIORITY_META } from "@/lib/priority";
import type { Priority } from "@/lib/types";

export function PriorityLabel({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  const meta = PRIORITY_META[priority];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      style={{ color: meta.color }}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}
