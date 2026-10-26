import { cn } from "@/lib/cn";

export function Logo({
  className,
  src,
  alt = "ASA",
}: {
  className?: string;
  src?: string | null;
  alt?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn("h-7 max-w-24 object-contain object-left", className)}
      />
    );
  }

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
