"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TagChip } from "@/components/ui/badge";
import { createTag, deleteTag, updateTag } from "@/lib/api";
import { useAccess, useWorkspace } from "@/lib/workspace";

const COLORS = ["#8b5cf6", "#ec4899", "#eab308", "#3b82f6", "#f97316", "#34d399"];

export function TagsManager() {
  const tags = useWorkspace((state) => state.tags);
  const allTasks = useWorkspace((state) => state.tasks);
  const { isAdmin } = useAccess();
  const tasks = useMemo(
    () => allTasks.filter((task) => !task.id.startsWith("hist-")),
    [allTasks],
  );
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-ink">Tags</h2>
        <p className="mt-1 text-sm text-faint">
          Organize e categorize tarefas em todo o espaço de trabalho.
        </p>
      </div>

      {isAdmin ? (
        <Card className="border-none">
          <form
            className="flex flex-col gap-4 md:flex-row md:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              createTag(name, color);
              setName("");
            }}
          >
            <div className="flex-1">
              <Input
                label="Nova tag"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="ex. campanha"
              />
            </div>
            <div className="flex gap-2 pb-1">
              {COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setColor(item)}
                  className="h-7 w-7 rounded-full transition-transform hover:scale-105"
                  style={{
                    backgroundColor: item,
                    outline: color === item ? "2px solid var(--text-primary)" : undefined,
                    outlineOffset: 2,
                  }}
                  title={item}
                />
              ))}
            </div>
            <Button type="submit">Criar</Button>
          </form>
        </Card>
      ) : null}

      {tags.length === 0 ? (
        <p className="text-sm text-faint">Nenhuma tag cadastrada.</p>
      ) : (
        <div className="space-y-3">
          {tags.map((tag) => {
            const count = tasks.filter((task) => task.tagIds.includes(tag.id)).length;
            return (
              <Card key={tag.id} className="flex items-center justify-between gap-4 border-none">
                <div className="flex items-center gap-3">
                  <TagChip name={tag.name} color={tag.color} />
                  <span className="text-xs text-faint">{count} tarefas</span>
                </div>
                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={tag.name}
                      onChange={(event) => updateTag(tag.id, { name: event.target.value })}
                      className="h-9 w-32 rounded-full border border-line bg-base px-3 text-xs text-ink outline-none focus:border-ink"
                    />
                    <button
                      type="button"
                      onClick={() => deleteTag(tag.id)}
                      className="text-xs text-faint hover:text-ink"
                    >
                      Remover
                    </button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
