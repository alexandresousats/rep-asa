"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AddMemberDialog } from "@/components/team/add-member-dialog";
import { accessLabel, MemberDialog } from "@/components/team/member-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { computeInsights } from "@/lib/insights";
import { useWorkspace } from "@/lib/workspace";

export default function TeamPage() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const users = useWorkspace((state) => state.users);
  const currentUserId = useWorkspace((state) => state.user?.id);
  const isAdmin = users.find((user) => user.id === currentUserId)?.access === "admin";
  const tasks = useWorkspace((state) => state.tasks);
  const projects = useWorkspace((state) => state.projects);
  const insights = computeInsights(tasks, projects, users);
  const maxDone = Math.max(...insights.memberLoad.map((item) => item.done), 1);
  const editing = users.find((user) => user.id === editingId) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-ink">Equipe</h1>
          <p className="mt-2 text-sm text-faint">
            Desempenho por pessoa, com base nas tarefas do workspace.
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Adicionar pessoa
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {insights.memberLoad.map((item) => {
          const user = users.find((entry) => entry.id === item.userId);
          if (!user) return null;
          return (
            <Card key={user.id}>
              <div className="mb-5 flex items-center gap-3">
                <Avatar initials={user.initials} src={user.avatar} name={user.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{user.name}</p>
                  <p className="truncate text-xs text-faint">
                    {user.role} · {accessLabel(user.access)}
                  </p>
                </div>
                {user.master && user.id === currentUserId ? (
                  <Link href="/configuracoes" className="text-xs text-faint hover:text-ink">
                    Configurações
                  </Link>
                ) : !user.master && (isAdmin || user.id === currentUserId) ? (
                  <button
                    type="button"
                    onClick={() => setEditingId(user.id)}
                    className="text-xs text-faint hover:text-ink"
                  >
                    Editar
                  </button>
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
      <AddMemberDialog open={open} onClose={() => setOpen(false)} />
      <MemberDialog
        user={editing}
        open={Boolean(editing)}
        onClose={() => setEditingId(null)}
        canEditAccess={isAdmin}
        requireCurrentPassword={editing?.id === currentUserId}
      />
    </div>
  );
}
