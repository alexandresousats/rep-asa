import { cn } from "@/lib/cn";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "pill";
  size?: "sm" | "md";
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
        variant === "primary" && "rounded-full bg-ink text-base hover:opacity-90",
        variant === "ghost" && "rounded-full text-ink hover:bg-hover",
        variant === "outline" &&
          "rounded-full border border-line text-ink hover:bg-elevated",
        variant === "pill" &&
          "rounded-full border border-line bg-elevated text-ink hover:bg-hover",
        className,
      )}
      {...props}
    />
  );
}
