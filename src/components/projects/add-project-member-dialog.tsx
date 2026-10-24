"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { addProjectMember } from "@/lib/api";
import type { User } from "@/lib/types";

export function AddProjectMemberDialog({
  open,
  projectId,
  memberIds,
  users,
  onClose,
}: {
  open: boolean;
  projectId: string;
  memberIds: string[];
  users: User[];
  onClose: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const options = users.filter(
    (user) => user.membershipStatus !== "pending" && !memberIds.includes(user.id),
  );
  const pending = users.filter((user) => user.membershipStatus === "pending");

  return (
    <Dialog
      open={open}
      title="Adicionar membro"
      onClose={() => {
        if (!busyId) onClose();
      }}
    >
      <p className="text-sm leading-6 text-faint">
        Inclui neste projeto alguém que já faz parte do espaço. O convite da Equipe só entra no
        espaço e não coloca a pessoa aqui.
      </p>
      {options.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {options.map((user) => (
            <li key={user.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-ink">{user.name}</span>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => {
                  setBusyId(user.id);
                  setError("");
                  void addProjectMember(projectId, user.id)
                    .then(() => setBusyId(null))
                    .catch((reason: unknown) => {
                      setBusyId(null);
                      setError(
                        reason instanceof Error ? reason.message : "Não foi possível incluir esta pessoa.",
                      );
                    });
                }}
                className="shrink-0 text-xs text-faint hover:text-ink disabled:opacity-40"
              >
                {busyId === user.id ? "Incluindo" : "Incluir"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm leading-6 text-faint">
          Não há ninguém do espaço fora deste projeto.
        </p>
      )}
      {pending.length > 0 ? (
        <p className="mt-4 text-sm leading-6 text-faint">
          {pending.map((user) => user.name).join(", ")} ainda não aceitou o convite do espaço.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      <p className="mt-5 text-sm text-faint">
        <Link href="/equipe" className="text-ink hover:underline" onClick={onClose}>
          Convidar para o espaço
        </Link>
      </p>
    </Dialog>
  );
}
