import { cn } from "@/lib/cn";

export function TagChip({
  name,
  color,
  onRemove,
}: {
  name: string;
  color: string;
  onRemove?: () => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {name}
      {onRemove ? (
        <button type="button" onClick={onRemove} className="text-current">
          ×
        </button>
      ) : null}
    </span>
  );
}

export function StatusDot({
  done,
  className,
}: {
  done?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 items-center justify-center rounded-full border",
        done ? "border-ink bg-ink" : "border-line",
        className,
      )}
    >
      {done ? (
        <span className="block h-1.5 w-1.5 rounded-full bg-base" />
      ) : null}
    </span>
  );
}
