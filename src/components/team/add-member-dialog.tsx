"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addMember } from "@/lib/api";
import type { AccessLevel } from "@/lib/types";

const ACCESS_OPTIONS: { id: AccessLevel; label: string }[] = [
  { id: "editor", label: "Editor" },
  { id: "admin", label: "Administrador" },
  { id: "leitura", label: "Leitura" },
];

export function AddMemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("");
  const [access, setAccess] = useState<AccessLevel>("editor");
  const [error, setError] = useState("");

  function close() {
    setError("");
    onClose();
  }

  return (
    <Dialog open={open} title="Nova pessoa" onClose={close}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void addMember({ name, email, password, role, access }).then((result) => {
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setName("");
            setEmail("");
            setPassword("");
            setRole("");
            setAccess("editor");
            setError("");
            onClose();
          });
        }}
      >
        <Input label="Nome" value={name} onChange={(event) => setName(event.target.value)} />
        <Input
          label="E-mail"
          type="email"
          value={email}
          autoComplete="off"
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          label="Senha"
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
        />
        <Input label="Cargo" value={role} onChange={(event) => setRole(event.target.value)} />
        <label className="flex flex-col gap-2 text-sm text-muted">
          Nível de acesso
          <select
            value={access}
            onChange={(event) => setAccess(event.target.value as AccessLevel)}
            className="h-11 rounded-2xl border border-line bg-base px-4 text-sm text-ink"
          >
            {ACCESS_OPTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit">Adicionar</Button>
        </div>
      </form>
    </Dialog>
  );
}
