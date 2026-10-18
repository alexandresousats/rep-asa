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
        onFocus={(event) => event.currentTarget.select()}
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
        className={cn(
          "min-w-0 flex-1 bg-transparent text-inherit outline-none",
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
