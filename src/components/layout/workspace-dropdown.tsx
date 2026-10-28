"use client";

import {
  Check,
  ChevronsUpDown,
  Plus,
  Settings,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { selectWorkspace } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { WorkspaceInfo, WorkspaceMembership } from "@/lib/types";

export function WorkspaceDropdown({
  workspace,
  workspaces,
  collapsed,
  onCreateWorkspace,
  onOpenSettings,
}: {
  workspace: WorkspaceInfo | null;
  workspaces: WorkspaceMembership[];
  collapsed: boolean;
  onCreateWorkspace: () => void;
  onOpenSettings: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const currentInitial = workspace?.name
    ? workspace.name.trim().charAt(0).toUpperCase()
    : "E";

  return (
    <>
      {collapsed ? (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          title={workspace?.name ?? "Espaço de trabalho"}
          aria-label={workspace?.name ?? "Espaço de trabalho"}
          aria-expanded={isOpen}
          className={cn(
            "group relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-150",
            isOpen
              ? "border-ink bg-hover shadow-sm"
              : "border-line/70 bg-base/60 text-ink hover:border-line hover:bg-hover hover:scale-105",
          )}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 via-blue-500/20 to-purple-500/20 text-[11px] font-bold text-ink">
            {currentInitial}
          </span>
        </button>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-label="Selecionar espaço de trabalho"
          className={cn(
            "group flex w-full items-center justify-between gap-2.5 rounded-xl border p-2 text-left transition-all duration-150",
            isOpen
              ? "border-ink/40 bg-hover shadow-sm ring-1 ring-ink/10"
              : "border-line/70 bg-base/50 hover:border-line hover:bg-hover",
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 via-blue-500/15 to-purple-500/20 border border-line/60 text-xs font-bold text-ink shadow-xs transition-transform duration-150 group-hover:scale-105">
              {currentInitial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-ink">
                {workspace?.name ?? "Sem espaço"}
              </p>
            </div>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-faint transition-colors group-hover:text-ink" />
        </button>
      )}

      {isOpen ? (
        <WorkspaceMenu
          anchorRef={buttonRef}
          workspace={workspace}
          workspaces={workspaces}
          collapsed={collapsed}
          onClose={() => setIsOpen(false)}
          onCreateWorkspace={() => {
            setIsOpen(false);
            onCreateWorkspace();
          }}
          onOpenSettings={() => {
            setIsOpen(false);
            onOpenSettings();
          }}
        />
      ) : null}
    </>
  );
}

function WorkspaceMenu({
  anchorRef,
  workspace,
  workspaces,
  collapsed,
  onClose,
  onCreateWorkspace,
  onOpenSettings,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  workspace: WorkspaceInfo | null;
  workspaces: WorkspaceMembership[];
  collapsed: boolean;
  onClose: () => void;
  onCreateWorkspace: () => void;
  onOpenSettings: () => void;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number; width?: number }>({
    top: 0,
    left: 0,
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    function updatePosition() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuWidth = collapsed ? 240 : Math.max(240, rect.width);

      let top = rect.bottom + 6;
      let left = rect.left;

      if (collapsed) {
        top = Math.max(8, rect.top);
        left = rect.right + 8;
      }

      // Keep within horizontal window bounds
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }
      left = Math.max(8, left);

      // Check bottom overflow
      const estimatedHeight = 220;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedHeight - 6);
      }

      setCoords({ top, left, width: menuWidth });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, collapsed]);

  useEffect(() => {
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
      data-workspace-menu
      style={{
        top: coords.top,
        left: coords.left,
        width: coords.width ?? 240,
      }}
      className="fixed z-50 rounded-2xl border border-line bg-elevated/95 p-1.5 shadow-2xl backdrop-blur-md menu-in"
    >
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
          Espaços de trabalho
        </span>
        <span className="rounded-full border border-line bg-base/80 px-1.5 py-0.5 text-[10px] font-medium text-faint">
          {workspaces.length}
        </span>
      </div>

      <div className="max-h-60 space-y-0.5 overflow-y-auto py-1">
        {workspaces.map((item) => {
          const active = item.id === workspace?.id;
          const initial = item.name.trim().charAt(0).toUpperCase();

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onClose();
                if (!active) {
                  void selectWorkspace(item.id);
                }
              }}
              className={cn(
                "group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors",
                active ? "bg-hover text-ink" : "text-muted hover:bg-hover hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold transition-transform duration-150 group-hover:scale-105",
                  active
                    ? "bg-gradient-to-br from-indigo-500/25 to-blue-500/20 text-ink border border-line/80"
                    : "bg-base border border-line/60 text-faint",
                )}
              >
                {initial}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium leading-tight">{item.name}</p>
                <p className="truncate text-[10px] leading-tight text-faint">
                  {item.access === "admin"
                    ? "Administrador"
                    : item.access === "editor"
                      ? "Editor"
                      : "Leitura"}
                </p>
              </div>

              {active ? (
                <Check className="h-4 w-4 shrink-0 text-ink" strokeWidth={2.5} />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="my-1.5 h-px bg-line-subtle" />

      <div className="space-y-0.5">
        <button
          type="button"
          onClick={onCreateWorkspace}
          className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-xs font-medium text-muted hover:bg-hover hover:text-ink transition-colors"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-dashed border-line bg-base text-faint group-hover:border-line-subtle group-hover:text-ink transition-colors">
            <Plus className="h-3.5 w-3.5" />
          </span>
          <span>Novo espaço de trabalho</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-xs font-medium text-muted hover:bg-hover hover:text-ink transition-colors"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-line/50 bg-base text-faint group-hover:text-ink transition-colors">
            <Settings className="h-3.5 w-3.5" />
          </span>
          <span>Configurações do espaço</span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
