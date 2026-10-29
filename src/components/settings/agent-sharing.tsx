"use client";

import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { getAgentSharing, saveAgentSharing } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { AgentSharing } from "@/lib/types";

const ACCESS_LABEL: Record<AgentSharing["members"][number]["access"], string> = {
  admin: "Admin",
  editor: "Editor",
  leitura: "Leitura",
  cliente: "Cliente",
};

function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40",
        checked ? "bg-emerald-500" : "bg-hover",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

// Só o admin decide quem vê e continua as conversas dos colegas com o Agente IA.
export function AgentSharingCard() {
  const [data, setData] = useState<AgentSharing | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getAgentSharing().then(
      (result) => {
        if (alive) setData(result);
      },
      (reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "Não foi possível carregar.");
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  async function save(input: Parameters<typeof saveAgentSharing>[0]) {
    setBusy(true);
    setError("");
    try {
      setData(await saveAgentSharing(input));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
          <Users className="h-4 w-4 text-muted" strokeWidth={1.5} />
          Conversas compartilhadas
        </h2>
        <p className="mt-1 text-sm leading-6 text-faint">
          Por padrão, cada pessoa só vê as próprias conversas com o agente. Ao liberar, quem estiver
          ativo abaixo vê e pode continuar as conversas dos outros ativos, mas só o dono renomeia ou
          apaga. Quem estiver desativado não vê as conversas da equipe e as dele ficam privadas.
        </p>
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {data === null ? (
        error ? null : <div className="h-24 animate-pulse rounded-2xl bg-elevated" />
      ) : (
        <Card className="space-y-4 border-none">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-ink">Permitir para todos do espaço</p>
              <p className="text-xs text-faint">
                {data.enabled ? "Liberado para quem está ativo na lista." : "Desligado: tudo privado."}
              </p>
            </div>
            <Switch
              checked={data.enabled}
              disabled={busy}
              label="Permitir conversas compartilhadas para todos do espaço"
              onChange={(enabled) => void save({ enabled })}
            />
          </div>
          {data.enabled ? (
            <ul className="divide-y divide-line-subtle border-t border-line-subtle">
              {data.members.map((member) => (
                <li key={member.userId} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">
                      {member.name}
                      {member.owner ? <span className="ml-1.5 text-xs text-faint">· dono</span> : null}
                    </p>
                    <p className="truncate text-xs text-faint">
                      {ACCESS_LABEL[member.access]} · {member.email}
                    </p>
                  </div>
                  <Switch
                    checked={member.shared}
                    disabled={busy}
                    label={`Compartilhar conversas com ${member.name}`}
                    onChange={(shared) => void save({ members: [{ userId: member.userId, shared }] })}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {data.enabled && data.members.some((member) => member.access === "cliente") ? (
            <p className="text-xs leading-5 text-faint">
              Pessoas com acesso de cliente começam desativadas. Ative só se quiser que elas vejam as
              conversas internas.
            </p>
          ) : null}
        </Card>
      )}
    </section>
  );
}
