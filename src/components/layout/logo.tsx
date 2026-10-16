import { cn } from "@/lib/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-full border border-line text-[11px] font-medium tracking-tight text-ink",
        className,
      )}
    >
      A
    </span>
  );
}
