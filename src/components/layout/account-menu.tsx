"use client";

import { CreditCard, LifeBuoy, LogOut, Settings, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import type { SettingsTab } from "@/components/settings/settings-dialog";
import { SupportDialog } from "@/components/layout/support-dialog";
import { logout } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/lib/workspace";

export function AccountMenu({
  collapsed,
  onOpenSettings,
}: {
  collapsed: boolean;
  onOpenSettings: (tab: SettingsTab) => void;
}) {
  const user = useWorkspace((state) => state.user);
  const [open, setOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Conta"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex items-center rounded-xl text-left transition-colors",
          collapsed ? "h-9 w-9 justify-center" : "w-full gap-3 px-2 py-2",
          open ? "bg-hover" : "hover:bg-hover",
        )}
      >
        <Avatar initials={user?.initials ?? "AS"} src={user?.avatar} name={user?.name} />
        <div
          className={cn(
            "min-w-0 flex-1 overflow-hidden transition-all duration-300",
            collapsed ? "hidden" : "max-w-40 opacity-100",
          )}
        >
          <p className="truncate text-sm text-ink">{user?.name ?? "ASA"}</p>
          <p className="truncate text-xs text-faint">{user?.role ?? "Membro"}</p>
        </div>
      </button>

      {open ? (
        <AccountMenuPanel
          anchorRef={buttonRef}
          collapsed={collapsed}
          email={user?.email}
          onClose={() => setOpen(false)}
          onOpenSettings={(tab) => {
            setOpen(false);
            onOpenSettings(tab);
          }}
          onLogout={() => {
            setOpen(false);
            void logout().then(() => router.replace("/login"));
          }}
          onOpenSupport={() => {
            setOpen(false);
            setSupportOpen(true);
          }}
        />
      ) : null}
      <SupportDialog open={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}

function AccountMenuPanel({
  anchorRef,
  collapsed,
  email,
  onClose,
  onOpenSettings,
  onLogout,
  onOpenSupport,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  collapsed: boolean;
  email?: string;
  onClose: () => void;
  onOpenSettings: (tab: SettingsTab) => void;
  onLogout: () => void;
  onOpenSupport: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 268 });

  useLayoutEffect(() => {
    function updatePosition() {
      const el = anchorRef.current;
      const menu = menuRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = 268;
      const height = menu?.offsetHeight || 320;
      let left = collapsed ? rect.right + 8 : rect.left;
      let top = collapsed ? rect.bottom - height : rect.top - height - 8;

      if (left + width > window.innerWidth - 8) {
        left = window.innerWidth - width - 8;
      }
      left = Math.max(8, left);
      if (top < 8) top = Math.min(rect.bottom + 8, window.innerHeight - height - 8);
      top = Math.max(8, top);

      setCoords({ top, left, width });
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
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, onClose]);

  const items: {
    label: string;
    icon: typeof Settings;
    onClick: () => void;
  }[] = [
    { label: "Configurações", icon: Settings, onClick: () => onOpenSettings("perfil") },
    {
      label: "Convidar colegas de equipe",
      icon: UserPlus,
      onClick: () => onOpenSettings("equipe"),
    },
    { label: "Atualizar plano", icon: CreditCard, onClick: () => onOpenSettings("assinatura") },
    { label: "Suporte", icon: LifeBuoy, onClick: onOpenSupport },
  ];

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ top: coords.top, left: coords.left, width: coords.width }}
      className="fixed z-[55] rounded-2xl border border-line bg-elevated p-1.5 shadow-2xl menu-in"
    >
      {email ? (
        <p className="truncate px-3 pt-2 pb-1.5 text-xs text-faint">{email}</p>
      ) : null}

      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={item.onClick}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-hover"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.5} />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}

      <div className="my-1 h-px bg-line" />

      <button
        type="button"
        role="menuitem"
        onClick={onLogout}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-hover"
      >
        <LogOut className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.5} />
        <span>Sair</span>
      </button>
    </div>,
    document.body,
  );
}
