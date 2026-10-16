"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { createTask } from "@/lib/api";
import type { Priority, Tag, User } from "@/lib/types";

export function CreateTaskDialog({
  open,
  onClose,
  projectId,
  users,
  tags,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  users: User[];
  tags: Tag[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState(users[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("media");
  const [tagIds, setTagIds] = useState<string[]>([]);

  function reset() {
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("media");
    setTagIds([]);
  }

  return (
    <Dialog open={open} title="Nova tarefa" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          createTask({
            projectId,
            title,
            description,
            assigneeId: assigneeId || null,
            dueDate: dueDate || null,
            startDate: dueDate || null,
            priority,
            tagIds,
          });
          reset();
          onClose();
        }}
      >
        <Input
          label="Nome"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
        <Textarea
          label="Descrição"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <label className="flex flex-col gap-2 text-sm text-muted">
          Responsável
          <select
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            className="h-11 rounded-2xl border border-line bg-elevated px-4 text-sm text-ink"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Data"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
        <label className="flex flex-col gap-2 text-sm text-muted">
          Prioridade
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority)}
            className="h-11 rounded-2xl border border-line bg-elevated px-4 text-sm text-ink"
          >
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const active = tagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() =>
                  setTagIds((current) =>
                    current.includes(tag.id)
                      ? current.filter((id) => id !== tag.id)
                      : [...current, tag.id],
                  )
                }
                className="rounded-full border px-3 py-1 text-xs"
                style={{
                  borderColor: active ? tag.color : "var(--border-default)",
                  color: active ? tag.color : "var(--text-tertiary)",
                }}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit">Criar</Button>
        </div>
      </form>
    </Dialog>
  );
}
