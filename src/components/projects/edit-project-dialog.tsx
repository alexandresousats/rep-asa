"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { updateProject } from "@/lib/api";
import type { Project } from "@/lib/types";

const COLORS = ["#a78bfa", "#34d399", "#60a5fa", "#f97316", "#f472b6", "#facc15"];

export function EditProjectDialog({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [color, setColor] = useState(project.color);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const colors = COLORS.includes(project.color) ? COLORS : [project.color, ...COLORS];

  return (
    <Dialog open title="Editar projeto" onClose={onClose} className="max-w-lg">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSaving(true);
          setError("");
          void updateProject(project.id, { name, description, color })
            .then(() => onClose())
            .catch((reason: Error) => {
              setError(reason.message);
              setSaving(false);
            });
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
          rows={8}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className="flex gap-2">
          {colors.map((item) => (
            <button
              key={item}
              type="button"
              aria-label="Cor do projeto"
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
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
