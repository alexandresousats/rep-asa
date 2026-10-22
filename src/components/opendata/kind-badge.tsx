import { cn } from "@/lib/cn";
import { KIND_META, type DateKind } from "@/lib/opendata";

export function KindBadge({
  kind,
  className,
}: {
  kind: DateKind;
  className?: string;
}) {
  const meta = KIND_META[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium",
        meta.chip,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
