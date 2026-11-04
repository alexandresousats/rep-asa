import { cn } from "@/lib/cn";

export function Avatar({
  initials,
  size = "md",
  src,
  name,
  online = false,
  surface = "base",
}: {
  initials: string;
  size?: "xs" | "sm" | "md" | "lg";
  src?: string | null;
  name?: string;
  online?: boolean;
  surface?: "base" | "sidebar";
}) {
  const box =
    size === "xs"
      ? "h-4 w-4 text-[8px]"
      : size === "sm"
        ? "h-6 w-6 text-[10px]"
        : size === "lg"
          ? "h-16 w-16 text-lg"
          : "h-8 w-8 text-xs";
  const face = src ? (
    <img
      src={src}
      alt={name ? `Avatar de ${name}` : ""}
      className={cn("inline-block rounded-full border border-line object-cover", box)}
    />
  ) : (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-line bg-hover font-medium text-ink",
        box,
      )}
    >
      {initials}
    </span>
  );
  if (!online) return face;
  const dot =
    size === "xs" ? "h-1.5 w-1.5" : size === "sm" ? "h-2.5 w-2.5" : size === "lg" ? "h-4 w-4" : "h-3 w-3";
  return (
    <span className="relative inline-flex shrink-0">
      {face}
      <span
        className={cn(
          "absolute -right-0.5 -bottom-0.5 rounded-full bg-[#25d366]",
          surface === "sidebar" ? "shadow-[0_0_0_2px_var(--bg-sidebar)]" : "shadow-[0_0_0_2px_var(--bg-base)]",
          dot,
        )}
        aria-hidden
      />
    </span>
  );
}
