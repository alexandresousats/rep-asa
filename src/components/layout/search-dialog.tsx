"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";

export function SearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const projects = useAppStore((state) => state.projects);
  const tasks = useAppStore((state) => state.tasks);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return { projects: projects.slice(0, 4), tasks: [] };
    return {
      projects: projects.filter((project) =>
        project.name.toLowerCase().includes(term),
      ),
      tasks: tasks.filter(
        (task) =>
          !task.id.startsWith("hist-") && task.title.toLowerCase().includes(term),
      ),
    };
  }, [projects, query, tasks]);

  if (!open) return null;

  function go(href: string) {
    setQuery("");
    onClose();
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Fechar busca"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-[20px] bg-elevated">
        <label className="flex items-center gap-3 px-4">
          <Search className="h-4 w-4 text-faint" strokeWidth={1.5} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar projetos e tarefas"
            className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
        </label>
        <div className="max-h-80 overflow-y-auto px-2 pb-2">
          {results.projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => go(`/projetos/${project.id}`)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-hover"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              {project.name}
            </button>
          ))}
          {results.tasks.slice(0, 8).map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => go(`/projetos/${task.projectId}?task=${task.id}`)}
              className="block w-full truncate rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-hover"
            >
              {task.title}
            </button>
          ))}
          {results.projects.length === 0 && results.tasks.length === 0 ? (
            <p className="px-3 py-4 text-sm text-faint">Nenhum resultado.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
