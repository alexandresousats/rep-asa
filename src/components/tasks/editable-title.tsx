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
  const multiline = Tag === "h2";

  function commit() {
    if (committed.current) return;
    committed.current = true;
    const next = (multiline ? value.replace(/[\r\n]+/g, " ") : value).trim();
    setEditing(false);
    if (next && next !== title) onCommit(next);
    else setValue(title);
  }

  function cancel() {
    committed.current = true;
    setValue(title);
    setEditing(false);
  }

  if (editing && multiline) {
    return (
      <div className="relative max-h-60 overflow-hidden">
        <div
          aria-hidden
          className={cn(
            "invisible whitespace-pre-wrap [overflow-wrap:anywhere]",
            className,
          )}
        >
          {value || "\u00a0"}
          {value.endsWith("\n") ? "\u00a0" : ""}
        </div>
        <textarea
          autoFocus
          rows={1}
          value={value}
          aria-label="Título da tarefa"
          onFocus={(event) => {
            const input = event.currentTarget;
            const placeCaret = () => {
              const end = input.value.length;
              input.setSelectionRange(end, end);
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
              event.preventDefault();
              cancel();
            }
          }}
          onBlur={commit}
          className={cn(
            "absolute inset-0 h-full w-full resize-none overflow-auto border-0 bg-transparent p-0 font-[inherit] text-inherit outline-none [overflow-wrap:anywhere]",
            className,
          )}
        />
      </div>
    );
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
            event.preventDefault();
            cancel();
          }
        }}
        onBlur={commit}
        style={{ textOverflow: "clip" }}
        className={cn(
          "min-w-0 max-w-full flex-1 bg-transparent text-inherit outline-none",
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
      className={cn(className, multiline && "[overflow-wrap:anywhere]")}
    >
      {title}
    </Tag>
  );
}
