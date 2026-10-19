"use client";

import { useRouter } from "next/navigation";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/lib/workspace";

export default function InboxPage() {
  const router = useRouter();
  const items = useWorkspace((state) => state.notifications);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-ink">Caixa de entrada</h1>
          <p className="mt-2 text-sm text-faint">
            Atribuições, comentários, menções e convites deste espaço.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void markAllNotificationsRead()}
          className="text-xs text-faint hover:text-ink"
        >
          Marcar lidas
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-faint">Nada por aqui.</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                void markNotificationRead(item.id);
                if (item.href) router.push(item.href);
              }}
              className={cn(
                "block w-full rounded-2xl px-3 py-3 text-left hover:bg-hover",
                !item.readAt && "bg-elevated",
              )}
            >
              <p className="text-sm text-ink">{item.title}</p>
              <p className="mt-1 text-sm text-faint">{item.body}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
