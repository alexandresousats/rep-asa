"use client";

import { Check, ChevronDown, Search, User as UserIcon, UserMinus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import type { User } from "@/lib/types";

export function TaskAssigneePicker({
  assigneeId,
  users,
  canWrite,
  onSelect,
}: {
  assigneeId: string | null;
  users: User[];
  canWrite: boolean;
  onSelect: (assigneeId: string | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const assignee = users.find((user) => user.id === assigneeId);

  if (!canWrite) {
    if (assignee) {
      return (
        <span className="inline-flex items-center gap-2 rounded-xl border border-line/50 bg-base/40 px-2.5 py-1 text-xs text-ink">
          <Avatar initials={assignee.initials} src={assignee.avatar} name={assignee.name} size="sm" />
          <span className="truncate">{assignee.name}</span>
        </span>
      );
    }
    return <span className="text-xs text-faint">Sem responsável</span>;
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label="Alterar responsável da tarefa"
        className={cn(
          "group inline-flex items-center gap-2 rounded-xl text-xs transition-all duration-150",
          assignee
            ? "border border-line/70 bg-base/60 px-2.5 py-1 text-ink hover:border-line hover:bg-hover"
            : "border border-dashed border-line/70 bg-base/30 px-2.5 py-1 text-faint hover:border-line-subtle hover:bg-hover hover:text-ink",
          isOpen && "border-ink/50 bg-hover shadow-sm ring-1 ring-ink/10",
        )}
      >
        {assignee ? (
          <>
            <Avatar initials={assignee.initials} src={assignee.avatar} name={assignee.name} size="sm" />
            <span className="max-w-[130px] truncate font-medium text-ink">{assignee.name}</span>
          </>
        ) : (
          <>
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-line text-faint transition-colors group-hover:border-line-subtle group-hover:text-ink">
              <UserIcon className="h-3 w-3" />
            </span>
            <span className="text-faint transition-colors group-hover:text-ink">Sem responsável</span>
          </>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-faint transition-transform duration-150 group-hover:text-ink",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen ? (
        <AssigneeMenu
          anchorRef={buttonRef}
          assigneeId={assigneeId}
          users={users}
          onClose={() => setIsOpen(false)}
          onSelect={(id) => {
            onSelect(id);
            setIsOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function AssigneeMenu({
  anchorRef,
  assigneeId,
  users,
  onClose,
  onSelect,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  assigneeId: string | null;
  users: User[];
  onClose: () => void;
  onSelect: (assigneeId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeUsers = users.filter((u) => u.membershipStatus !== "pending");
  const trimmed = query.trim().toLowerCase();
  const filteredUsers = activeUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(trimmed) ||
      (u.email ? u.email.toLowerCase().includes(trimmed) : false) ||
      (u.role ? u.role.toLowerCase().includes(trimmed) : false),
  );

  useLayoutEffect(() => {
    function updatePosition() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuWidth = 260;

      // Align with right edge of the button by default
      let left = rect.right - menuWidth;
      let top = rect.bottom + 6;

      if (left < 8) {
        left = Math.max(8, rect.left);
      }
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }

      // Check bottom overflow
      const estimatedHeight = 280;
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
    inputRef.current?.focus();

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
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
      data-assignee-menu
      style={{
        top: coords.top,
        left: coords.left,
        width: 260,
      }}
      className="fixed z-50 rounded-2xl border border-line bg-elevated/95 p-1.5 shadow-2xl backdrop-blur-md menu-in"
    >
      {/* Search Input */}
      <div className="relative mb-1 flex items-center px-1 pt-0.5">
        <Search className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-faint" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar membro..."
          className="w-full rounded-xl border border-line/60 bg-base/50 py-1.5 pl-8 pr-7 text-xs text-ink placeholder:text-faint outline-none transition-colors focus:border-ink/50 focus:bg-base"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 rounded-full p-0.5 text-faint hover:text-ink"
            aria-label="Limpar busca"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      {/* Unassigned Option */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-xs transition-colors",
          assigneeId === null ? "bg-hover text-ink" : "text-muted hover:bg-hover hover:text-ink",
        )}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-dashed border-line bg-base text-faint group-hover:border-line-subtle group-hover:text-ink transition-colors">
          <UserMinus className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 truncate font-medium">Sem responsável</span>
        {assigneeId === null ? (
          <Check className="h-4 w-4 shrink-0 text-ink" strokeWidth={2.5} />
        ) : null}
      </button>

      <div className="my-1 h-px bg-line-subtle" />

      {/* Section Header */}
      <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
        <span>Membros da equipe</span>
        <span className="text-[10px] font-normal text-faint">{filteredUsers.length}</span>
      </div>

      {/* Users List */}
      <div className="max-h-52 space-y-0.5 overflow-y-auto">
        {filteredUsers.length > 0 ? (
          filteredUsers.map((user) => {
            const isSelected = user.id === assigneeId;

            return (
              <button
                key={user.id}
                type="button"
                onClick={() => onSelect(user.id)}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors",
                  isSelected
                    ? "bg-hover text-ink"
                    : "text-muted hover:bg-hover hover:text-ink",
                )}
              >
                <Avatar initials={user.initials} src={user.avatar} name={user.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium leading-tight text-ink">
                    {user.name}
                  </p>
                  <p className="truncate text-[10px] leading-tight text-faint">
                    {user.role || user.email || "Membro"}
                  </p>
                </div>
                {isSelected ? (
                  <Check className="h-4 w-4 shrink-0 text-ink" strokeWidth={2.5} />
                ) : null}
              </button>
            );
          })
        ) : (
          <div className="py-4 text-center text-xs text-faint">
            Nenhum membro encontrado
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
