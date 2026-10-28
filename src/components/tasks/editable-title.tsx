"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

export function EditableTitle({
  title,
  className,
  as: Tag = "span",
  startEditing = false,
  onCommit,
}: {
  title: string;
  className?: string;
  as?: "span" | "h2";
  startEditing?: boolean;
  onCommit: (title: string) => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [value, setValue] = useState(title);
  const committed = useRef(false);

  function commit() {
    if (committed.current) return;
    committed.current = true;
    const next = value.trim();
    setEditing(false);
    if (next && next !== title) onCommit(next);
    else setValue(title);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        aria-label="Título da tarefa"
        onFocus={(event) => {
          const input = event.currentTarget;
          const placeCaret = () => {
            const fits = input.clientWidth > 0 && input.scrollWidth <= input.clientWidth + 1;
            const caret = fits ? input.value.length : 0;
            input.setSelectionRange(caret, caret);
            input.scrollLeft = 0;
          };
          placeCaret();
          requestAnimationFrame(placeCaret);
        }}
        onChange={(event) => setValue(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            committed.current = true;
            setValue(title);
            setEditing(false);
          }
        }}
        onBlur={commit}
        style={{ textOverflow: "clip" }}
        className={cn(
          "min-w-0 max-w-full bg-transparent text-inherit outline-none",
          Tag === "h2" ? "block w-full" : "flex-1",
          className,
        )}
      />
    );
  }

  return (
    <Tag
      title="Clique duas vezes para editar"
      onDoubleClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        committed.current = false;
        setValue(title);
        setEditing(true);
      }}
      className={className}
    >
      {title}
    </Tag>
  );
}
