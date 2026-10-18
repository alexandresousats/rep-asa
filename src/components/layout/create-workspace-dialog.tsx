"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createWorkspace } from "@/lib/api";

export function CreateWorkspaceDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function close() {
    setName("");
    setError("");
    onClose();
  }

  return (
    <Dialog open={open} title="Novo espaço" onClose={close}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) {
            setError("Informe o nome do espaço.");
            return;
          }
          void createWorkspace(name)
            .then(() => close())
            .catch(() => setError("Não foi possível criar o espaço."));
        }}
      >
        <p className="text-sm text-faint">
          Você entra como administrador. Os convites da equipe valem só para este espaço.
        </p>
        <Input
          label="Nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Cliente Norte"
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit">Criar</Button>
        </div>
      </form>
    </Dialog>
  );
}
