"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Dialog({
  open,
  title,
  children,
  onClose,
  className,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full max-w-md rounded-[24px] border border-line bg-elevated p-6",
          className,
        )}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-medium text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-faint hover:bg-hover hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
