"use client";

import { useMemo, useState } from "react";
import { MonthCalendar } from "@/components/calendar/month-calendar";
import { TaskViewer } from "@/components/tasks/task-panel";
import { usePrefs } from "@/lib/prefs";
import { useWorkspace } from "@/lib/workspace";

export default function CalendarPage() {
  const [month, setMonth] = useState(new Date(2026, 9, 1));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const allTasks = useWorkspace((state) => state.tasks);
  const tasks = useMemo(
    () => allTasks.filter((task) => !task.id.startsWith("hist-")),
    [allTasks],
  );
  const users = useWorkspace((state) => state.users);
  const tags = useWorkspace((state) => state.tags);
  const projects = useWorkspace((state) => state.projects);
  const taskView = usePrefs((state) => state.taskView);
  const setTaskView = usePrefs((state) => state.setTaskView);
  const selected = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? null,
    [tasks, selectedId],
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 flex flex-col p-4 sm:p-6 overflow-hidden">
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          tasks={tasks}
          tags={tags}
          users={users}
          projects={projects}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      {selected ? (
        <TaskViewer
          task={selected}
          users={users}
          tags={tags}
          projects={projects}
          mode={taskView}
          onModeChange={setTaskView}
          onClose={() => setSelectedId(null)}
          subtasks={tasks.filter((task) => task.parentId === selected.id)}
          onOpenSubtask={setSelectedId}
        />
      ) : null}
    </div>
  );
}
