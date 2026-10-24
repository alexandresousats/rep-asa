"use client";

import { MoreVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export function ProjectActionsMenu({
  onEdit,
  onAddMember,
  onDelete,
}: {
  onEdit: () => void;
  onAddMember: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function stopLinkNavigation(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Opções do projeto"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          stopLinkNavigation(event);
          setOpen((value) => !value);
        }}
        className="rounded-full p-1 text-faint hover:bg-base hover:text-ink"
      >
        <MoreVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
      {open ? (
        <div
          role="menu"
          onClick={stopLinkNavigation}
          className="absolute right-0 z-30 mt-1 min-w-40 rounded-2xl border border-line bg-elevated p-1 shadow-lg"
        >
          <MenuItem
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Editar
          </MenuItem>
          <MenuItem
            onClick={() => {
              setOpen(false);
              onAddMember();
            }}
          >
            Adicionar membro
          </MenuItem>
          <MenuItem
            variant="danger"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Excluir
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-hover",
        variant === "danger" ? "text-red-400" : "text-ink",
      )}
    >
      {children}
    </button>
  );
}
