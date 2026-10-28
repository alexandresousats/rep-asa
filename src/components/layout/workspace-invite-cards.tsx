"use client";

import { useState } from "react";
import { accessLabel } from "@/components/team/member-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { acceptInvite, declineInvite } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useWorkspace } from "@/lib/workspace";

export function WorkspaceInviteCards() {
  const invites = useWorkspace((state) => state.invites);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  if (invites.length === 0) return null;

  function fail(cause: unknown, fallback: string) {
    setError(cause instanceof ApiError ? cause.message : fallback);
  }

  return (
    <div className="space-y-3">
      {invites.map((invite) => (
        <Card key={invite.workspaceId} className="border-none bg-base">
          <p className="text-sm text-ink">{invite.workspaceName}</p>
          <p className="mt-1 text-xs text-faint">
            {invite.role} · {accessLabel(invite.access)}
          </p>
          <p className="mt-2 text-xs leading-5 text-faint">
            O plano e as vagas deste espaço ficam com o administrador.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy === invite.workspaceId}
              onClick={() => {
                setError("");
                setBusy(invite.workspaceId);
                void declineInvite(invite.workspaceId)
                  .catch((cause) => fail(cause, "Não foi possível recusar o convite."))
                  .finally(() => setBusy(""));
              }}
            >
              Recusar
            </Button>
            <Button
              type="button"
              disabled={busy === invite.workspaceId}
              onClick={() => {
                setError("");
                setBusy(invite.workspaceId);
                void acceptInvite(invite.workspaceId)
                  .catch((cause) => fail(cause, "Não foi possível aceitar o convite."))
                  .finally(() => setBusy(""));
              }}
            >
              Aceitar
            </Button>
          </div>
        </Card>
      ))}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
