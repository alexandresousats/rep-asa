"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/lib/workspace";

export function NotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const items = useWorkspace((state) => state.notifications);
  const unread = items.filter((item) => !item.readAt).length;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!(event.target instanceof Node)) return;
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Notificações"
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink"
      >
        <Bell className="h-4 w-4" strokeWidth={1.5} />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] text-base">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className={cn(
            "fixed z-50 w-80 rounded-2xl border border-line bg-elevated p-2 shadow-lg",
            collapsed ? "top-4 left-16" : "top-4 left-60",
          )}
        >
          <div className="mb-1 flex items-center justify-between px-2 py-1">
            <p className="text-sm text-ink">Notificações</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAllNotificationsRead()}
                className="text-xs text-faint hover:text-ink"
              >
                Marcar lidas
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-faint">Nada por aqui.</p>
          ) : (
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    void markNotificationRead(item.id);
                    setOpen(false);
                    if (item.href) router.push(item.href);
                  }}
                  className={cn(
                    "block w-full rounded-xl px-3 py-2 text-left hover:bg-hover",
                    !item.readAt && "bg-base",
                  )}
                >
                  <p className="text-sm text-ink">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-faint">{item.body}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
