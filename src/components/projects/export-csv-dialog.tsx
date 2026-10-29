"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { exportProjectCsv } from "@/lib/api";

function tasksLabel(count: number) {
  return count === 1 ? "1 tarefa" : `${count} tarefas`;
}

export function ExportCsvDialog({
  open,
  projectId,
  total,
  filteredIds,
  onClose,
}: {
  open: boolean;
  projectId: string;
  total: number;
  // null quando a tela não tem filtro ativo.
  filteredIds: string[] | null;
  onClose: () => void;
}) {
  const [everything, setEverything] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filtering = filteredIds !== null;
  const exportAll = !filtering || everything;
  const count = exportAll ? total : filteredIds.length;

  function close() {
    if (busy) return;
    setError("");
    setEverything(false);
    onClose();
  }

  async function run() {
    setBusy(true);
    setError("");
    try {
      await exportProjectCsv(projectId, exportAll ? undefined : filteredIds);
      setBusy(false);
      setEverything(false);
      onClose();
    } catch (reason) {
      setBusy(false);
      setError(reason instanceof Error ? reason.message : "Não foi possível exportar o CSV.");
    }
  }

  return (
    <Dialog open={open} title="Exportar CSV" onClose={close}>
      <p className="text-sm leading-6 text-faint">
        {filtering
          ? "Por padrão, o arquivo traz as tarefas que estão na tela, com os filtros e a busca atuais."
          : "O arquivo traz todas as tarefas do projeto, incluindo subtarefas."}
      </p>
      {filtering ? (
        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={everything}
            onChange={(event) => setEverything(event.target.checked)}
            className="h-4 w-4 accent-current"
          />
          Exportar todas as tarefas do projeto
        </label>
      ) : null}
      <p className="mt-4 text-xs text-faint">
        {tasksLabel(count)} · UTF-8, abre no Excel, Google Sheets e Numbers
      </p>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={close}>
          Cancelar
        </Button>
        <Button type="button" disabled={busy || count === 0} onClick={() => void run()}>
          {busy ? "Exportando…" : "Exportar"}
        </Button>
      </div>
    </Dialog>
  );
}
