import { cn } from "@/lib/cn";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Input({ label, className, id, ...props }: Props) {
  return (
    <label className="flex w-full flex-col gap-2 text-sm text-muted" htmlFor={id}>
      {label ? <span>{label}</span> : null}
      <input
        id={id}
        suppressHydrationWarning
        className={cn(
          "h-11 w-full overflow-hidden rounded-2xl border border-line bg-elevated px-4 text-sm text-ink outline-none placeholder:truncate placeholder:text-faint focus:border-ink",
          className,
        )}
        {...props}
      />
    </label>
  );
}

export function Textarea({
  label,
  className,
  id,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="flex w-full flex-col gap-2 text-sm text-muted" htmlFor={id}>
      {label ? <span>{label}</span> : null}
      <textarea
        id={id}
        className={cn(
          "min-h-28 w-full resize-none overflow-hidden rounded-2xl border border-line bg-elevated px-4 py-3 text-sm break-words text-ink outline-none placeholder:whitespace-normal placeholder:break-words placeholder:text-faint focus:border-ink",
          className,
        )}
        {...props}
      />
    </label>
  );
}
