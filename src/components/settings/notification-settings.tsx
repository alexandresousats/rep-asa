"use client";

import { useState } from "react";
import { WorkspaceInviteCards } from "@/components/layout/workspace-invite-cards";
import { Button } from "@/components/ui/button";
import { acceptInvite, declineInvite, markAllNotificationsRead, markNotificationRead } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/lib/workspace";

export function NotificationSettings() {
  const invites = useWorkspace((state) => state.invites);
  const items = useWorkspace((state) => state.notifications);
  const inviteIds = new Set(invites.map((invite) => invite.workspaceId));
  const rest = items.filter(
    (item) =>
      !(item.type === "workspace_invite" && item.workspaceId && inviteIds.has(item.workspaceId)),
  );
  const unread = items.filter((item) => !item.readAt).length;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-ink">Notificações</h2>
          <p className="mt-1 text-sm text-faint">
            Convites de espaço de trabalho e outros avisos da sua conta. Aceite o convite para
            entrar no espaço da equipe.
          </p>
        </div>
        {unread > 0 ? (
          <button
            type="button"
            onClick={() => {
              setError("");
              void markAllNotificationsRead().catch((cause) =>
                setError(
                  cause instanceof ApiError
                    ? cause.message
                    : "Não foi possível marcar as notificações como lidas.",
                ),
              );
            }}
            className="shrink-0 text-xs text-faint hover:text-ink"
          >
            Marcar lidas
          </button>
        ) : null}
      </div>

      {invites.length === 0 && rest.length === 0 ? (
        <p className="text-sm text-faint">Nenhuma notificação.</p>
      ) : null}

      <WorkspaceInviteCards />

      {rest.length > 0 ? (
        <div className="space-y-3">
          {rest.map((item) =>
            item.type === "workspace_invite" && item.workspaceId && !item.readAt ? (
              <div key={item.id} className="rounded-[20px] bg-base px-5 py-4">
                <p className="text-sm text-ink">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-faint">{item.body}</p>
                <p className="mt-2 text-xs leading-5 text-faint">
                  O plano e as vagas deste espaço ficam com o administrador.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy === item.id}
                    onClick={() => {
                      setError("");
                      setBusy(item.id);
                      void declineInvite(item.workspaceId as string)
                        .catch((cause) =>
                          setError(
                            cause instanceof ApiError
                              ? cause.message
                              : "Não foi possível recusar o convite.",
                          ),
                        )
                        .finally(() => setBusy(""));
                    }}
                  >
                    Recusar
                  </Button>
                  <Button
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => {
                      setError("");
                      setBusy(item.id);
                      void acceptInvite(item.workspaceId as string)
                        .catch((cause) =>
                          setError(
                            cause instanceof ApiError
                              ? cause.message
                              : "Não foi possível aceitar o convite.",
                          ),
                        )
                        .finally(() => setBusy(""));
                    }}
                  >
                    Aceitar
                  </Button>
                </div>
              </div>
            ) : (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.readAt) return;
                  void markNotificationRead(item.id);
                }}
                className={cn(
                  "block w-full rounded-[20px] px-5 py-4 text-left",
                  item.readAt ? "bg-elevated" : "bg-base",
                )}
              >
                <p className="text-sm text-ink">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-faint">{item.body}</p>
              </button>
            ),
          )}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </section>
  );
}
