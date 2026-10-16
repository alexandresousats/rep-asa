"use client";

import { Avatar } from "@/components/ui/avatar";
import { StatusDot, TagChip } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";
import { setTaskStatus } from "@/lib/api";
import type { Project, Tag, Task, User } from "@/lib/types";

const PRIORITY_LABEL: Record<Task["priority"], string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export function TaskList({
  tasks,
  users,
  tags,
  selectedId,
  onSelect,
}: {
  tasks: Task[];
  users: User[];
  tags: Tag[];
  projects?: Project[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const sections = Array.from(new Set(tasks.map((task) => task.section)));

  return (
    <div className="min-w-[640px]">
      <div className="grid grid-cols-[1fr_160px_120px_120px] gap-3 border-b border-line-subtle px-4 py-3 text-xs text-faint">
        <span>Nome</span>
        <span>Responsável</span>
        <span>Data</span>
        <span>Prioridade</span>
      </div>
      {sections.map((section) => (
        <div key={section}>
          <div className="px-4 py-3 text-xs uppercase tracking-wide text-faint">
            {section}
          </div>
          {tasks
            .filter((task) => task.section === section)
            .map((task) => {
              const assignee = users.find((user) => user.id === task.assigneeId);
              const taskTags = tags.filter((tag) => task.tagIds.includes(tag.id));
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onSelect(task.id)}
                  className={cn(
                    "grid w-full grid-cols-[1fr_160px_120px_120px] items-center gap-3 border-b border-line-subtle px-4 py-3 text-left text-sm hover:bg-hover",
                    selectedId === task.id && "bg-elevated",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        setTaskStatus(
                          task.id,
                          task.status === "done" ? "todo" : "done",
                        );
                      }}
                    >
                      <StatusDot done={task.status === "done"} />
                    </span>
                    <span
                      className={cn(
                        "truncate",
                        task.status === "done" && "text-faint line-through",
                      )}
                    >
                      {task.title}
                    </span>
                    <span className="hidden gap-1 lg:flex">
                      {taskTags.map((tag) => (
                        <TagChip key={tag.id} name={tag.name} color={tag.color} />
                      ))}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-muted">
                    {assignee ? (
                      <>
                        <Avatar initials={assignee.initials} size="sm" />
                        <span className="truncate">{assignee.name.split(" ")[0]}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                  <span className="text-muted">
                    {task.dueDate ? formatDay(task.dueDate) : "—"}
                  </span>
                  <span className="text-muted">{PRIORITY_LABEL[task.priority]}</span>
                </button>
              );
            })}
        </div>
      ))}
    </div>
  );
}
