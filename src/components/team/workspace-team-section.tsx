"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AddMemberDialog } from "@/components/team/add-member-dialog";
import { accessLabel, MemberDialog } from "@/components/team/member-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { removeMember } from "@/lib/api";
import { computeInsights } from "@/lib/insights";
import { useWorkspace } from "@/lib/workspace";

export function WorkspaceTeamSection() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const users = useWorkspace((state) => state.users);
  const currentUserId = useWorkspace((state) => state.user?.id);
  const isAdmin = users.find((user) => user.id === currentUserId)?.access === "admin";
  const tasks = useWorkspace((state) => state.tasks);
  const projects = useWorkspace((state) => state.projects);
  const activeUsers = users.filter((user) => user.membershipStatus !== "pending");
  const pendingUsers = users.filter((user) => user.membershipStatus === "pending");
  const insights = computeInsights(tasks, projects, activeUsers);
  const maxDone = Math.max(...insights.memberLoad.map((item) => item.done), 1);
  const editing = users.find((user) => user.id === editingId) ?? null;
  const removingUser = users.find((user) => user.id === removingId) ?? null;

  function askRemove(id: string) {
    setRemoveError("");
    setRemovingId(id);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-ink">Equipe</h2>
          <p className="mt-1 text-sm text-faint">
            Desempenho por pessoa, com base nas tarefas do espaço de trabalho.
          </p>
        </div>
        {isAdmin ? (
          <Button type="button" onClick={() => setOpen(true)} className="shrink-0 gap-1.5">
            <Plus className="h-4 w-4" />
            Convidar para o espaço
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {insights.memberLoad.map((item) => {
          const user = users.find((entry) => entry.id === item.userId);
          if (!user) return null;
          return (
            <Card key={user.id} className="border-none">
              <div className="mb-5 flex items-center gap-3">
                <Avatar initials={user.initials} src={user.avatar} name={user.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{user.name}</p>
                  <p className="truncate text-xs text-faint">
                    {user.role} · {accessLabel(user.access)}
                  </p>
                </div>
                {user.owner && user.id === currentUserId ? (
                  <Link href="/configuracoes?tab=perfil" className="text-xs text-faint hover:text-ink">
                    Perfil
                  </Link>
                ) : !user.owner && (isAdmin || user.id === currentUserId) ? (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingId(user.id)}
                      className="text-xs text-faint hover:text-ink"
                    >
                      Editar
                    </button>
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => askRemove(user.id)}
                        className="text-xs text-faint hover:text-ink"
                      >
                        Remover
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="mb-4 h-px bg-line">
                <div
                  className="h-px bg-ink"
                  style={{ width: `${(item.done / maxDone) * 100}%` }}
                />
              </div>
              <div className="grid grid-cols-3 text-center text-sm">
                <div>
                  <p className="text-ink">{item.done}</p>
                  <p className="text-xs text-faint">Feitas</p>
                </div>
                <div>
                  <p className="text-ink">{item.open}</p>
                  <p className="text-xs text-faint">Abertas</p>
                </div>
                <div>
                  <p className="text-ink">{item.overdue}</p>
                  <p className="text-xs text-faint">Atrasadas</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {isAdmin && pendingUsers.length > 0 ? (
        <div>
          <h3 className="text-sm text-ink">Convites pendentes</h3>
          <p className="mt-1 mb-4 text-sm text-faint">
            Essas pessoas só entram no espaço depois de aceitar a notificação.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {pendingUsers.map((user) => (
              <Card key={user.id} className="border-none">
                <div className="flex items-center gap-3">
                  <Avatar initials={user.initials} src={user.avatar} name={user.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{user.name}</p>
                    <p className="truncate text-xs text-faint">
                      {user.email} · {user.role} · {accessLabel(user.access)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => askRemove(user.id)}
                    className="text-xs text-faint hover:text-ink"
                  >
                    Cancelar
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      <AddMemberDialog open={open} onClose={() => setOpen(false)} />
      <MemberDialog
        user={editing}
        open={Boolean(editing)}
        onClose={() => setEditingId(null)}
        canEditAccess={Boolean(isAdmin && editing && !editing.owner)}
        requireCurrentPassword={editing?.id === currentUserId}
      />
      <Dialog
        open={Boolean(removingUser)}
        title={removingUser?.membershipStatus === "pending" ? "Cancelar convite" : "Remover da equipe"}
        onClose={() => {
          if (!removing) setRemovingId(null);
        }}
      >
        <p className="text-sm leading-6 text-faint">
          {removingUser?.membershipStatus === "pending"
            ? `${removingUser.name} deixa de ter o convite para este espaço.`
            : `${removingUser?.name ?? "Esta pessoa"} sai deste espaço. A conta continua existindo e as tarefas atribuídas ficam sem responsável.`}
        </p>
        {removeError ? <p className="mt-3 text-sm text-red-400">{removeError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={removing}
            onClick={() => setRemovingId(null)}
          >
            Voltar
          </Button>
          <Button
            type="button"
            disabled={removing || !removingUser}
            onClick={() => {
              if (!removingUser) return;
              setRemoving(true);
              setRemoveError("");
              void removeMember(removingUser.id).then((result) => {
                setRemoving(false);
                if (!result.ok) {
                  setRemoveError(result.error);
                  return;
                }
                setRemovingId(null);
              });
            }}
          >
            {removingUser?.membershipStatus === "pending" ? "Cancelar convite" : "Remover"}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
