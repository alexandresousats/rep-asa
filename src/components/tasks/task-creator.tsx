"use client";

import { Avatar } from "@/components/ui/avatar";
import type { Task, User } from "@/lib/types";

export function TaskCreator({
  task,
  users,
  variant = "cell",
}: {
  task: Pick<Task, "createdById" | "createdByName">;
  users: User[];
  variant?: "cell" | "field";
}) {
  const person = task.createdById
    ? users.find((user) => user.id === task.createdById)
    : undefined;
  const name = person?.name ?? task.createdByName?.trim() ?? "";
  if (!name) {
    return <span className="text-faint">{variant === "field" ? "Não registrado" : "—"}</span>;
  }
  const label = variant === "field" ? name : name.split(" ")[0];
  return (
    <span
      className={
        variant === "field"
          ? "flex min-w-0 items-center justify-end gap-2 text-ink"
          : "flex min-w-0 items-center gap-2 text-muted"
      }
      title={name}
    >
      {person ? (
        <Avatar initials={person.initials} src={person.avatar} name={person.name} size="sm" />
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
