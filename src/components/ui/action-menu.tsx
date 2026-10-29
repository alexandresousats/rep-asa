"use client";

import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type ActionMenuItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  variant?: "default" | "danger";
  hidden?: boolean;
};

export function ActionMenu({
  items,
  label,
  icon: Icon = MoreHorizontal,
  triggerClassName,
  iconClassName = "h-4 w-4",
  menuClassName,
  isolate = false,
}: {
  items: ActionMenuItem[];
  label: string;
  icon?: LucideIcon;
  triggerClassName?: string;
  iconClassName?: string;
  menuClassName?: string;
  // Dentro de um <Link>, o clique no menu não pode navegar.
  isolate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const visible = items.filter((item) => !item.hidden);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    function onPointer(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function stop(event: React.SyntheticEvent) {
    if (!isolate) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function moveFocus(event: React.KeyboardEvent) {
    const buttons = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
    if (event.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = buttons.length - 1;
    if (event.key === "Tab") setOpen(false);
    if (next === null) return;
    event.preventDefault();
    buttons[next].focus();
  }

  if (visible.length === 0) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          stop(event);
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "cursor-pointer rounded-full p-2 text-faint transition-colors hover:bg-hover hover:text-ink",
          triggerClassName,
        )}
      >
        <Icon className={iconClassName} strokeWidth={1.75} />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          onClick={stop}
          onKeyDown={moveFocus}
          className={cn(
            "absolute right-0 z-30 mt-1 min-w-48 rounded-2xl border border-line bg-elevated p-1 shadow-lg",
            menuClassName,
          )}
        >
          {visible.map((item, index) => {
            const ItemIcon = item.icon;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitem"
                onClick={(event) => {
                  stop(event);
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm outline-none hover:bg-hover focus-visible:bg-hover",
                  item.variant === "danger" ? "text-red-400" : "text-ink",
                )}
              >
                {ItemIcon ? <ItemIcon className="h-4 w-4 shrink-0" strokeWidth={1.75} /> : null}
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
