"use client";

import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TagChip } from "@/components/ui/badge";
import { createTag } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Tag } from "@/lib/types";

export const TAG_COLORS = [
  "#8b5cf6", // Violeta
  "#3b82f6", // Azul
  "#06b6d4", // Ciano
  "#10b981", // Verde
  "#eab308", // Amarelo
  "#f97316", // Laranja
  "#ef4444", // Vermelho
  "#ec4899", // Rosa
  "#6366f1", // Índigo
  "#64748b", // Ardósia
];

export function TaskTagPicker({
  tagIds,
  tags,
  canWrite,
  onUpdateTagIds,
  variant = "field",
}: {
  tagIds: string[];
  tags: Tag[];
  canWrite: boolean;
  onUpdateTagIds: (nextIds: string[]) => void;
  variant?: "field" | "cell";
}) {
  const isCell = variant === "cell";
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleClose() {
    setIsOpen(false);
    setQuery("");
  }

  function handleOpen() {
    setQuery("");
    setIsOpen(true);
  }

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      handleClose();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handleClose();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !isCell) return;

    function updatePosition() {
      const el = buttonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuWidth = 288;
      const estimatedHeight = 360;
      let left = rect.left;
      let top = rect.bottom + 6;
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }
      if (left < 8) left = 8;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedHeight - 6);
      }
      setCoords({ top, left });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, isCell]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const assignedTags = tags.filter((tag) => tagIds.includes(tag.id));
  const trimmedQuery = query.trim().toLowerCase();

  const matchingTags = tags.filter((tag) =>
    tag.name.toLowerCase().includes(trimmedQuery),
  );

  const exactMatch = tags.find((tag) => tag.name.toLowerCase() === trimmedQuery);

  async function handleCreateTag() {
    if (!trimmedQuery || creating) return;
    setCreating(true);
    try {
      const newTag = await createTag(trimmedQuery, selectedColor);
      if (newTag) {
        if (!tagIds.includes(newTag.id)) {
          onUpdateTagIds([...tagIds, newTag.id]);
        }
        setQuery("");
        // Rotate to the next color for the next tag
        const currentIndex = TAG_COLORS.indexOf(selectedColor);
        const nextColor = TAG_COLORS[(currentIndex + 1) % TAG_COLORS.length];
        setSelectedColor(nextColor);
      }
    } catch (error) {
      console.error("Falha ao criar tag:", error);
    } finally {
      setCreating(false);
    }
  }

  function toggleTag(tagId: string) {
    if (tagIds.includes(tagId)) {
      onUpdateTagIds(tagIds.filter((id) => id !== tagId));
    } else {
      onUpdateTagIds([...tagIds, tagId]);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!trimmedQuery) return;
      if (exactMatch) {
        toggleTag(exactMatch.id);
        setQuery("");
      } else {
        void handleCreateTag();
      }
    }
  }

  const chips = assignedTags.map((tag) => (
    <TagChip
      key={tag.id}
      name={tag.name}
      color={tag.color}
      onRemove={isCell || !canWrite ? undefined : () => toggleTag(tag.id)}
    />
  ));

  const menu = isOpen && canWrite ? (
    <div
      ref={menuRef}
      style={isCell ? { top: coords.top, left: coords.left, width: 288 } : undefined}
      className={cn(
        "z-[80] w-72 rounded-2xl border border-line bg-elevated p-3 text-left shadow-2xl",
        isCell
          ? "fixed menu-in"
          : "absolute right-0 top-full mt-2 animate-in fade-in zoom-in-95 duration-150",
      )}
    >
          {/* Search/Create Input */}
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-faint pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Buscar ou criar tag..."
              className="w-full rounded-lg border border-line bg-base/50 pl-8 pr-7 py-1.5 text-xs text-ink placeholder:text-faint outline-none focus:border-ink transition-colors"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 text-faint hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {/* Color Palette */}
          <div className="mt-2.5 mb-2 border-b border-line-subtle pb-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-faint">
              <span>Cor para nova tag</span>
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: selectedColor }}
              />
            </div>
            <div className="flex items-center justify-between gap-1">
              {TAG_COLORS.map((color) => {
                const active = selectedColor === color;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={cn(
                      "h-5 w-5 rounded-full transition-transform hover:scale-110",
                      active && "ring-2 ring-offset-2 ring-ink ring-offset-elevated scale-105",
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={`Cor ${color}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Create action if typed */}
          {trimmedQuery && !exactMatch ? (
            <div className="mb-2">
              <button
                type="button"
                disabled={creating}
                onClick={handleCreateTag}
                className="flex w-full items-center gap-2 rounded-lg bg-base/60 px-2.5 py-2 text-xs font-medium text-ink hover:bg-hover transition-colors"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: selectedColor }}
                />
                <span className="truncate">
                  Criar tag <strong className="text-ink">&ldquo;{trimmedQuery}&rdquo;</strong>
                </span>
                {creating ? (
                  <Loader2 className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-faint" />
                ) : (
                  <Plus className="ml-auto h-3.5 w-3.5 shrink-0 text-faint" />
                )}
              </button>
            </div>
          ) : null}

          {/* Existing tags list */}
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {matchingTags.length > 0 ? (
              <>
                <div className="px-2 py-1 text-[11px] font-medium text-faint">
                  Tags no espaço ({matchingTags.length})
                </div>
                {matchingTags.map((tag) => {
                  const isAssigned = tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-ink hover:bg-hover transition-colors",
                        isAssigned && "bg-hover/70 font-medium",
                      )}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="truncate">{tag.name}</span>
                      {isAssigned ? (
                        <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-ink" />
                      ) : null}
                    </button>
                  );
                })}
              </>
            ) : !trimmedQuery ? (
              <div className="py-3 text-center text-xs text-faint">
                Digite acima para criar a primeira tag
              </div>
            ) : null}
          </div>
    </div>
  ) : null;

  return (
    <div
      ref={containerRef}
      className={
        isCell
          ? "min-w-0 max-w-full"
          : "relative flex flex-wrap items-center justify-end gap-1.5"
      }
    >
      {isCell ? (
        canWrite ? (
          <button
            ref={buttonRef}
            type="button"
            onClick={() => (isOpen ? handleClose() : handleOpen())}
            aria-expanded={isOpen}
            aria-label="Alterar tags"
            className={cn(
              "inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1 overflow-hidden rounded-lg border border-transparent px-1.5 py-1 text-left transition-colors hover:border-line hover:bg-elevated hover:shadow-sm",
              isOpen && "border-line bg-elevated shadow-sm",
            )}
          >
            {chips.length > 0 ? chips : <span className="text-xs text-faint">—</span>}
          </button>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1 overflow-hidden px-1.5">
            {chips.length > 0 ? chips : <span className="text-xs text-faint">—</span>}
          </span>
        )
      ) : (
        <>
          {chips}
          {canWrite ? (
            assignedTags.length > 0 ? (
              <button
                type="button"
                onClick={() => (isOpen ? handleClose() : handleOpen())}
                aria-label="Adicionar tag"
                title="Adicionar tag"
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-line text-faint hover:border-line-subtle hover:bg-hover hover:text-ink transition-colors",
                  isOpen && "border-solid border-ink text-ink bg-hover",
                )}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => (isOpen ? handleClose() : handleOpen())}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-faint hover:border-line-subtle hover:bg-hover hover:text-ink transition-colors",
                  isOpen && "border-solid border-ink text-ink bg-hover",
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar tag</span>
              </button>
            )
          ) : assignedTags.length === 0 ? (
            <span className="text-xs text-faint">Sem tags</span>
          ) : null}
        </>
      )}
      {menu ? (isCell ? createPortal(menu, document.body) : menu) : null}
    </div>
  );
}
