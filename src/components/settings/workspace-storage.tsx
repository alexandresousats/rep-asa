"use client";

import { HardDrive } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { getWorkspaceStorage } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { WorkspaceStorage } from "@/lib/types";

const GB = 1024 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2).replace(".", ",")} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function StorageUsage({ usage }: { usage: WorkspaceStorage }) {
  const percent = Math.min(100, (usage.total / usage.limit) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink">
          {formatBytes(usage.total)} de {formatBytes(usage.limit)}
        </span>
        <span className="text-xs text-faint">{Math.round(percent)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-hover">
        <div
          className={cn(
            "h-full rounded-full",
            percent >= 90 ? "bg-red-500" : percent >= 75 ? "bg-amber-500" : "bg-emerald-500",
          )}
          style={{ width: `${Math.max(percent, usage.total > 0 ? 1 : 0)}%` }}
        />
      </div>
      <p className="text-xs text-faint">
        Arquivos das tarefas: {formatBytes(usage.files)} · Conversas do agente:{" "}
        {formatBytes(usage.agent)}. Conta no espaço de trabalho, não em cada pessoa convidada.
      </p>
    </div>
  );
}

export function WorkspaceStorageCard() {
  const [usage, setUsage] = useState<WorkspaceStorage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getWorkspaceStorage().then(
      (result) => {
        if (alive) setUsage(result);
      },
      (reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "Não foi possível carregar.");
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
        <HardDrive className="h-4 w-4 text-muted" strokeWidth={1.5} />
        Armazenamento
      </h2>
      <p className="mt-1 mb-4 text-sm text-faint">
        Arquivos e conversas do agente de todo mundo neste espaço somam no limite do espaço.
      </p>
      <Card className="border-none">
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : usage ? (
          <StorageUsage usage={usage} />
        ) : (
          <div className="h-12 animate-pulse rounded-xl bg-hover" />
        )}
      </Card>
    </section>
  );
}
