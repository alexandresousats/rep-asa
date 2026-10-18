"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { createProject } from "@/lib/api";

const COLORS = ["#a78bfa", "#34d399", "#60a5fa", "#f97316", "#f472b6", "#facc15"];

export function CreateProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [error, setError] = useState("");

  return (
    <Dialog open={open} title="Novo projeto" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void createProject({ name, description, color })
            .then((project) => {
              setName("");
              setDescription("");
              setError("");
              onClose();
              onCreated?.(project.id);
            })
            .catch((reason: Error) => setError(reason.message));
        }}
      >
        <Input
          label="Nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <Textarea
          label="Descrição"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className="flex gap-2">
          {COLORS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setColor(item)}
              className="h-7 w-7 rounded-full border border-line"
              style={{
                backgroundColor: item,
                outline: color === item ? "2px solid var(--text-primary)" : undefined,
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Criar projeto</Button>
        </div>
      </form>
    </Dialog>
  );
}
