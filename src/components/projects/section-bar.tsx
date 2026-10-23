"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { createSection, deleteSection, renameSection, reorderSections } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/lib/workspace";

/** Valor interno da tab “Todos” no cronograma (não é nome de sessão). */
export const SECTION_FILTER_ALL = "__all_sections__";

export function SectionBar({
  projectId,
  sections,
  active,
  accent,
  canManage,
  onSelect,
  includeAllTab = false,
  pendingDraft = false,
  onDraftOpened,
}: {
  projectId: string;
  sections: string[];
  active: string;
  accent: string;
  canManage: boolean;
  onSelect: (section: string) => void;
  includeAllTab?: boolean;
  pendingDraft?: boolean;
  onDraftOpened?: () => void;
}) {
  const tasks = useWorkspace((state) => state.tasks);
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const ignoreBlur = useRef(false);
  const dragName = useRef<string | null>(null);
  const dropAt = useRef<number | null>(null);
  const onDraftOpenedRef = useRef(onDraftOpened);
  onDraftOpenedRef.current = onDraftOpened;

  useEffect(() => {
    if (!pendingDraft) return;
    setDraft("");
    onDraftOpenedRef.current?.();
  }, [pendingDraft]);

  function commitCreate(name: string) {
    const trimmed = name.trim();
    setDraft(null);
    if (!trimmed) return;
    void createSection(projectId, trimmed)
      .then((created) => {
        if (created) onSelect(created);
      })
      .catch(() => undefined);
  }

  function commitRename(from: string, name: string) {
    setEditing(null);
    void renameSection(projectId, from, name)
      .then((next) => {
        if (next) onSelect(next);
      })
      .catch(() => undefined);
  }

  function move(source: string, index: number) {
    const from = sections.indexOf(source);
    if (from < 0) return;
    const target = index > from ? index - 1 : index;
    if (target === from) return;
    const next = [...sections];
    const [item] = next.splice(from, 1);
    next.splice(target, 0, item);
    reorderSections(projectId, next);
  }

  const pendingCount = pendingDelete
    ? tasks.filter(
        (task) =>
          task.projectId === projectId &&
          task.section === pendingDelete &&
          !task.id.startsWith("hist-"),
      ).length
    : 0;
  const fallback = pendingDelete ? neighbor(sections, pendingDelete) : null;

  return (
    <>
      <div
        className="flex items-center gap-1 overflow-x-auto px-6 pt-4 pb-2"
        onDragOver={(event) => {
          if (!dragName.current) return;
          event.preventDefault();
        }}
      >
        {includeAllTab ? (
          <div className="flex shrink-0 items-center">
            <div
              className="rounded-full"
              style={
                active === SECTION_FILTER_ALL
                  ? { backgroundColor: `color-mix(in srgb, ${accent} 22%, transparent)` }
                  : undefined
              }
            >
              <button
                type="button"
                onClick={() => onSelect(SECTION_FILTER_ALL)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  active === SECTION_FILTER_ALL
                    ? "font-medium text-ink"
                    : "text-faint hover:text-ink",
                )}
              >
                Todos
              </button>
            </div>
          </div>
        ) : null}
        {sections.map((section, index) =>
          editing === section ? (
            <form
              key={section}
              onSubmit={(event) => {
                event.preventDefault();
                commitRename(section, event.currentTarget.querySelector("input")?.value ?? "");
              }}
            >
              <input
                autoFocus
                defaultValue={section}
                aria-label="Título da sessão"
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  ignoreBlur.current = true;
                  setEditing(null);
                }}
                onBlur={(event) => {
                  if (ignoreBlur.current) {
                    ignoreBlur.current = false;
                    return;
                  }
                  commitRename(section, event.currentTarget.value);
                }}
                className="h-7 w-36 rounded-full bg-elevated px-3 text-xs text-ink outline-none"
              />
            </form>
          ) : (
            <div key={section} className="flex shrink-0 items-center">
              {dropIndex === index && dragging ? <DropMark color={accent} /> : null}
              <div
                draggable={canManage}
                onDragStart={(event) => {
                  if (!canManage) return;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", section);
                  dragName.current = section;
                  setDragging(section);
                }}
                onDragOver={(event) => {
                  if (!dragName.current) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  const after = event.clientX > rect.left + rect.width / 2;
                  const next = after ? index + 1 : index;
                  dropAt.current = next;
                  setDropIndex(next);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const source = event.dataTransfer.getData("text/plain") || dragName.current || "";
                  if (dropAt.current !== null) move(source, dropAt.current);
                  dragName.current = null;
                  dropAt.current = null;
                  setDragging(null);
                  setDropIndex(null);
                }}
                onDragEnd={() => {
                  dragName.current = null;
                  dropAt.current = null;
                  setDragging(null);
                  setDropIndex(null);
                }}
                className={cn(
                  "group relative flex items-center rounded-full",
                  canManage && "cursor-grab active:cursor-grabbing",
                  dragging === section && "opacity-40",
                )}
                style={
                  section === active
                    ? { backgroundColor: `color-mix(in srgb, ${accent} 22%, transparent)` }
                    : undefined
                }
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(section)}
                  onDoubleClick={() => {
                    if (canManage) setEditing(section);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(section);
                    }
                  }}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs",
                    section === active ? "font-medium text-ink" : "text-faint group-hover:text-ink",
                  )}
                >
                  {section}
                </div>
                {canManage && sections.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Excluir ${section}`}
                    draggable={false}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteError("");
                      setPendingDelete(section);
                    }}
                    onDragStart={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    className="mr-1.5 rounded-full p-0.5 text-faint opacity-70 hover:text-ink"
                  >
                    <X className="h-3 w-3" strokeWidth={1.75} />
                  </button>
                ) : null}
              </div>
            </div>
          ),
        )}
        {dropIndex === sections.length && dragging ? <DropMark color={accent} /> : null}
        {draft !== null ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              commitCreate(event.currentTarget.querySelector("input")?.value ?? "");
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={(event) => commitCreate(event.currentTarget.value)}
              placeholder="Nova sessão"
              className="h-7 w-36 rounded-full bg-elevated px-3 text-xs text-ink outline-none placeholder:text-faint"
            />
          </form>
        ) : canManage ? (
          <button
            type="button"
            aria-label="Nova sessão"
            onClick={() => setDraft("")}
            className="rounded-full p-1 text-faint hover:text-ink"
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <Dialog
        open={pendingDelete !== null}
        title="Excluir sessão"
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
      >
        <p className="text-sm leading-6 text-faint">
          {pendingCount > 0
            ? `${pendingDelete} será excluída. ${pendingCount === 1 ? "A tarefa desta sessão passa" : `As ${pendingCount} tarefas desta sessão passam`} para ${fallback}.`
            : `${pendingDelete} será excluída.`}
        </p>
        {deleteError ? <p className="mt-3 text-sm text-red-400">{deleteError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={deleting}
            onClick={() => setPendingDelete(null)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={deleting || !pendingDelete}
            onClick={() => {
              if (!pendingDelete) return;
              const name = pendingDelete;
              setDeleting(true);
              setDeleteError("");
              void deleteSection(projectId, name).then((result) => {
                setDeleting(false);
                if (!result.ok) {
                  setDeleteError(result.error);
                  return;
                }
                if (active === name) onSelect(result.fallback);
                setPendingDelete(null);
              });
            }}
          >
            Excluir
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function neighbor(sections: string[], name: string) {
  const index = sections.indexOf(name);
  if (index < 0) return sections[0] ?? "";
  return sections[index - 1] ?? sections[index + 1] ?? "";
}

function DropMark({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="mr-1 h-4 w-0.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}
