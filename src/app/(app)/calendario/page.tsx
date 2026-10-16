"use client";

import { useMemo, useState } from "react";
import { MonthCalendar } from "@/components/calendar/month-calendar";
import { TaskPanel } from "@/components/tasks/task-panel";
import { useAppStore } from "@/lib/store";

export default function CalendarPage() {
  const [month, setMonth] = useState(new Date(2026, 9, 1));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const allTasks = useAppStore((state) => state.tasks);
  const tasks = useMemo(
    () => allTasks.filter((task) => !task.id.startsWith("hist-")),
    [allTasks],
  );
  const users = useAppStore((state) => state.users);
  const tags = useAppStore((state) => state.tags);
  const projects = useAppStore((state) => state.projects);
  const selected = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? null,
    [tasks, selectedId],
  );

  return (
    <div className="flex min-h-full">
      <div className="min-w-0 flex-1 p-6">
        <h1 className="mb-6 text-2xl font-medium tracking-tight text-ink">
          Calendário
        </h1>
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          tasks={tasks}
          tags={tags}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      {selected ? (
        <div className="hidden shrink-0 lg:block">
          <TaskPanel
            resizable
            task={selected}
            users={users}
            tags={tags}
            projects={projects}
            onClose={() => setSelectedId(null)}
          />
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setSelectedId(null)}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-md">
            <TaskPanel
              task={selected}
              users={users}
              tags={tags}
              projects={projects}
              onClose={() => setSelectedId(null)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
