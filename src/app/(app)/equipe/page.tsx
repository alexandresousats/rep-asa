"use client";

import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { computeInsights } from "@/lib/insights";
import { useAppStore } from "@/lib/store";

export default function TeamPage() {
  const users = useAppStore((state) => state.users);
  const tasks = useAppStore((state) => state.tasks);
  const projects = useAppStore((state) => state.projects);
  const insights = computeInsights(tasks, projects, users);
  const maxDone = Math.max(...insights.memberLoad.map((item) => item.done), 1);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-medium tracking-tight text-ink">Equipe</h1>
      <p className="mb-8 text-sm text-faint">
        Desempenho por pessoa, com base nas tarefas do workspace.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {insights.memberLoad.map((item) => {
          const user = users.find((entry) => entry.id === item.userId);
          if (!user) return null;
          return (
            <Card key={user.id}>
              <div className="mb-5 flex items-center gap-3">
                <Avatar initials={user.initials} />
                <div>
                  <p className="text-sm text-ink">{user.name}</p>
                  <p className="text-xs text-faint">{user.role}</p>
                </div>
              </div>
              <div className="mb-4 h-px bg-line">
                <div
                  className="h-px bg-ink"
                  style={{ width: `${(item.done / maxDone) * 100}%` }}
                />
              </div>
              <div className="grid grid-cols-3 text-center text-sm">
                <div>
                  <p className="text-ink">{item.done}</p>
                  <p className="text-xs text-faint">Feitas</p>
                </div>
                <div>
                  <p className="text-ink">{item.open}</p>
                  <p className="text-xs text-faint">Abertas</p>
                </div>
                <div>
                  <p className="text-ink">{item.overdue}</p>
                  <p className="text-xs text-faint">Atrasadas</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
