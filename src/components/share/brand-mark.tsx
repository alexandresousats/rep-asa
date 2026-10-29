/* eslint-disable @next/next/no-img-element -- logo externa do workspace, sem domínio fixo para o next/image */
import type { PublicBrand } from "@/lib/api/public-share";
import { cn } from "@/lib/cn";

export function BrandMark({ brand, size = "md" }: { brand: PublicBrand; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14 rounded-2xl text-lg" : "h-9 w-9 rounded-xl text-sm";
  if (brand.logo) {
    return (
      <img
        src={brand.logo}
        alt={brand.name}
        referrerPolicy="no-referrer"
        className={cn("shrink-0 bg-elevated object-cover", box)}
      />
    );
  }
  const initials = brand.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center bg-ink font-semibold text-base", box)}
    >
      {initials || "•"}
    </span>
  );
}
