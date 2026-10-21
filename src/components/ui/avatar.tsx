import { cn } from "@/lib/cn";

export function Avatar({
  initials,
  size = "md",
  src,
  name,
}: {
  initials: string;
  size?: "xs" | "sm" | "md" | "lg";
  src?: string | null;
  name?: string;
}) {
  const box =
    size === "xs"
      ? "h-4 w-4 text-[8px]"
      : size === "sm"
        ? "h-6 w-6 text-[10px]"
        : size === "lg"
          ? "h-16 w-16 text-lg"
          : "h-8 w-8 text-xs";
  if (src) {
    return (
      <img
        src={src}
        alt={name ? `Avatar de ${name}` : ""}
        className={cn("inline-block rounded-full border border-line object-cover", box)}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-line bg-hover font-medium text-ink",
        box,
      )}
    >
      {initials}
    </span>
  );
}
