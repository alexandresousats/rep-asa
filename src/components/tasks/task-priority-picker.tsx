"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PriorityLabel } from "@/components/tasks/priority-label";
import { cn } from "@/lib/cn";
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/priority";
import type { Priority } from "@/lib/types";

export function TaskPriorityPicker({
  priority,
  canWrite,
  onChange,
  variant = "field",
}: {
  priority: Priority;
  canWrite: boolean;
  onChange: (priority: Priority) => void;
  variant?: "field" | "cell";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isCell = variant === "cell";

  const current = PRIORITY_META[priority];

  if (!canWrite) {
    if (isCell) return <PriorityLabel priority={priority} />;
    return (
      <span
        className="inline-flex items-center gap-2 rounded-xl border border-line/60 bg-base/40 px-2.5 py-1 text-xs font-medium"
        style={{ color: current.color }}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: current.color }}
        />
        <span>{current.label}</span>
      </span>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label="Alterar prioridade"
        className={cn(
          isCell
            ? "inline-flex max-w-full cursor-pointer items-center rounded-lg border border-transparent px-1.5 py-1 text-xs transition-colors hover:border-line hover:bg-elevated hover:shadow-sm"
            : "group inline-flex items-center gap-2 rounded-xl border border-line/70 bg-base/60 px-2.5 py-1 text-xs font-medium transition-all duration-150 hover:border-line hover:bg-hover",
          isOpen &&
            (isCell
              ? "border-line bg-elevated shadow-sm"
              : "border-ink/50 bg-hover shadow-sm ring-1 ring-ink/10"),
        )}
        style={isCell ? undefined : { color: current.color }}
      >
        {isCell ? (
          <PriorityLabel priority={priority} />
        ) : (
          <>
            <span
              className="h-2 w-2 shrink-0 rounded-full shadow-xs"
              style={{ backgroundColor: current.color }}
            />
            <span>{current.label}</span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-faint transition-transform duration-150 group-hover:text-ink",
                isOpen && "rotate-180",
              )}
            />
          </>
        )}
      </button>

      {isOpen ? (
        <PriorityMenu
          anchorRef={buttonRef}
          currentPriority={priority}
          onClose={() => setIsOpen(false)}
          onSelect={(p) => {
            onChange(p);
            setIsOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function PriorityMenu({
  anchorRef,
  currentPriority,
  onClose,
  onSelect,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  currentPriority: Priority;
  onClose: () => void;
  onSelect: (priority: Priority) => void;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    function updatePosition() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuWidth = 190;

      let left = rect.right - menuWidth;
      let top = rect.bottom + 6;

      if (left < 8) left = Math.max(8, rect.left);
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }

      const estimatedHeight = 180;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedHeight - 6);
      }

      setCoords({ top, left });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      data-priority-menu
      style={{
        top: coords.top,
        left: coords.left,
        width: 190,
      }}
      className="fixed z-[80] rounded-2xl border border-line bg-elevated/95 p-1.5 shadow-2xl backdrop-blur-md menu-in"
    >
      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
        Prioridade
      </div>

      <div className="space-y-0.5">
        {PRIORITY_ORDER.map((item) => {
          const meta = PRIORITY_META[item];
          const isSelected = item === currentPriority;

          return (
            <button
              key={item}
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                "group flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors",
                isSelected
                  ? "bg-hover font-medium text-ink"
                  : "text-muted hover:bg-hover hover:text-ink",
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                <span style={{ color: meta.color }}>{meta.label}</span>
              </div>
              {isSelected ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-ink" strokeWidth={2.5} />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
