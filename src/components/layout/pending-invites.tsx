"use client";

import { useState } from "react";
import { CreateWorkspaceDialog } from "@/components/layout/create-workspace-dialog";
import { accessLabel } from "@/components/team/member-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { acceptInvite, declineInvite } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

export function PendingInvites() {
  const invites = useWorkspace((state) => state.invites);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-16">
      <h1 className="text-2xl font-medium tracking-tight text-ink">Convites</h1>
      <p className="mt-2 mb-8 text-sm text-faint">
        Você entra num espaço de trabalho depois de aceitar o convite.
      </p>
      {invites.length === 0 ? (
        <p className="text-sm text-faint">Nenhum convite pendente.</p>
      ) : (
        <div className="space-y-3">
          {invites.map((invite) => (
            <Card key={invite.workspaceId} className="border-none">
              <p className="text-sm text-ink">{invite.workspaceName}</p>
              <p className="mt-1 text-xs text-faint">
                {invite.role} · {accessLabel(invite.access)}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setError("");
                    void declineInvite(invite.workspaceId).catch(() =>
                      setError("Não foi possível recusar o convite."),
                    );
                  }}
                >
                  Recusar
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setError("");
                    void acceptInvite(invite.workspaceId).catch(() =>
                      setError("Não foi possível aceitar o convite."),
                    );
                  }}
                >
                  Aceitar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      <div className="mt-10">
        <Button type="button" variant="outline" onClick={() => setCreating(true)}>
          Criar meu espaço
        </Button>
      </div>
      <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
