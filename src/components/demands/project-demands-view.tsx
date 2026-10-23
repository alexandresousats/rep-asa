"use client";

import { DemandsWorkspace } from "@/components/demands/demands-workspace";
import type { Project, Tag, Task, User } from "@/lib/types";

export function ProjectDemandsView({
  project,
  tasks,
  users,
  tags,
  onSelectTask,
  onCreateDemand,
  initialTab = "demandas",
}: {
  project: Project;
  tasks: Task[];
  users: User[];
  tags: Tag[];
  onSelectTask: (id: string) => void;
  onCreateDemand: () => void;
  initialTab?: "demandas" | "aprovacoes";
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <DemandsWorkspace
          tasks={tasks}
          projects={[project]}
          users={users}
          tags={tags}
          lockedProjectId={project.id}
          initialTab={initialTab}
          onSelect={onSelectTask}
          onCreate={onCreateDemand}
        />
      </div>
    </div>
  );
}
