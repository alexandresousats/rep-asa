"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppStore } from "@/lib/store";

export default function ProjectsPage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const projects = useAppStore((state) => state.projects);
  const allTasks = useAppStore((state) => state.tasks);
  const users = useAppStore((state) => state.users);
  const tasks = useMemo(
    () => allTasks.filter((task) => !task.id.startsWith("hist-")),
    [allTasks],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight text-ink">Projetos</h1>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo projeto
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => {
          const items = tasks.filter((task) => task.projectId === project.id);
          const done = items.filter((task) => task.status === "done").length;
          return (
            <Link key={project.id} href={`/projetos/${project.id}`}>
              <Card className="h-full border-none hover:bg-hover">
                <div className="mb-4 flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <h2 className="text-sm text-ink">{project.name}</h2>
                </div>
                <p className="mb-6 text-sm leading-6 text-faint">
                  {project.description}
                </p>
                <div className="flex items-center justify-between text-xs text-faint">
                  <span>
                    {done}/{items.length} concluídas
                  </span>
                  <span>
                    {project.memberIds
                      .map((id) => users.find((user) => user.id === id)?.initials)
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
      <CreateProjectDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(id) => router.push(`/projetos/${id}`)}
      />
    </div>
  );
}
