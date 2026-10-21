import { cn } from "@/lib/cn";

export function TagChip({
  name,
  color,
  onRemove,
  className,
}: {
  name: string;
  color: string;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
        className,
      )}
      style={{ backgroundColor: `${color}22`, color }}
    >
      <span className="truncate max-w-[160px]">{name}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remover tag ${name}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="-mr-1 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-current hover:bg-black/15 dark:hover:bg-white/20 transition-colors"
        >
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
