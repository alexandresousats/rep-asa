"use client";

import { LayoutGrid, List, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { usePrefs } from "@/lib/prefs";
import { useAccess, useWorkspace } from "@/lib/workspace";
import type { Project, Task, User } from "@/lib/types";

export default function ProjectsPage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const projects = useWorkspace((state) => state.projects);
  const allTasks = useWorkspace((state) => state.tasks);
  const users = useWorkspace((state) => state.users);
  const layout = usePrefs((state) => state.projectsLayout);
  const setLayout = usePrefs((state) => state.setProjectsLayout);
  const { isAdmin } = useAccess();
  const tasks = useMemo(
    () => allTasks.filter((task) => !task.id.startsWith("hist-")),
    [allTasks],
  );
  const rows = useMemo(
    () =>
      projects.map((project) => {
        const items = tasks.filter(
          (task) => task.projectId === project.id && !task.parentId,
        );
        const done = items.filter((task) => task.status === "done").length;
        const members = project.memberIds
          .map((id) => users.find((user) => user.id === id))
          .filter((user): user is User => Boolean(user));
        return { project, items, done, members };
      }),
    [projects, tasks, users],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-medium tracking-tight text-ink">Projetos</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border border-line p-0.5">
            <LayoutButton
              label="Grade"
              active={layout === "grid"}
              onClick={() => setLayout("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </LayoutButton>
            <LayoutButton
              label="Lista"
              active={layout === "list"}
              onClick={() => setLayout("list")}
            >
              <List className="h-4 w-4" />
            </LayoutButton>
          </div>
          {isAdmin ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Novo projeto
            </Button>
          ) : null}
        </div>
      </div>
      {layout === "list" ? (
        <ProjectList rows={rows} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <ProjectCard key={row.project.id} {...row} />
          ))}
        </div>
      )}
      <CreateProjectDialog
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(id) => router.push(`/projetos/${id}`)}
      />
    </div>
  );
}

function LayoutButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full p-1.5 transition-colors",
        active ? "bg-elevated text-ink" : "text-faint hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function ProjectCard({
  project,
  items,
  done,
  members,
}: {
  project: Project;
  items: Task[];
  done: number;
  members: User[];
}) {
  return (
    <Link href={`/projetos/${project.id}`} className="block h-full">
      <Card className="h-full border-none hover:bg-hover">
        <div className="mb-4 flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <h2 className="text-sm text-ink">{project.name}</h2>
        </div>
        <p className="mb-6 text-sm leading-6 text-faint">{project.description}</p>
        <div className="flex items-center justify-between gap-3 text-xs text-faint">
          <span>
            {done}/{items.length} concluídas
          </span>
          <MemberMarks members={members} />
        </div>
      </Card>
    </Link>
  );
}

function ProjectList({
  rows,
}: {
  rows: {
    project: Project;
    items: Task[];
    done: number;
    members: User[];
  }[];
}) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-line">
      <div className="hidden grid-cols-[minmax(0,1.6fr)_160px_160px] gap-4 border-b border-line-subtle px-5 py-3 text-xs text-faint md:grid">
        <span>Projeto</span>
        <span>Progresso</span>
        <span>Equipe</span>
      </div>
      <div className="divide-y divide-line-subtle">
        {rows.map(({ project, items, done, members }) => (
          <Link
            key={project.id}
            href={`/projetos/${project.id}`}
            className="grid gap-3 px-5 py-4 hover:bg-hover md:grid-cols-[minmax(0,1.6fr)_160px_160px] md:items-center"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <h2 className="truncate text-sm text-ink">{project.name}</h2>
              </div>
              <p className="mt-1 truncate pl-[18px] text-xs text-faint">
                {project.description}
              </p>
            </div>
            <span className="text-xs text-faint">
              {done}/{items.length} concluídas
            </span>
            <MemberMarks members={members} />
          </Link>
        ))}
      </div>
    </div>
  );
}

function MemberMarks({ members }: { members: User[] }) {
  if (members.length === 0) return null;
  return (
    <span className="flex items-center">
      {members.map((member, index) => (
        <span
          key={member.id}
          className={cn("inline-flex", index > 0 && "-ml-1.5")}
        >
          <Avatar initials={member.initials} src={member.avatar} name={member.name} size="sm" />
        </span>
      ))}
    </span>
  );
}
