"use client";

import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { loadSession, refreshNotifications } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import { useWorkspace } from "@/lib/workspace";

export function Providers({ children }: { children: React.ReactNode }) {
  const setHasHydrated = usePrefs((state) => state.setHasHydrated);
  const userId = useWorkspace((state) => state.user?.id);
  const workspaceId = useWorkspace((state) => state.workspace?.id);

  useEffect(() => {
    if (usePrefs.persist.hasHydrated()) {
      setHasHydrated(true);
    }
    const unsub = usePrefs.persist.onFinishHydration(() => {
      setHasHydrated(true);
    });
    void loadSession();
    const timer = window.setInterval(() => {
      void refreshNotifications();
    }, 20000);
    function onFocus() {
      void refreshNotifications();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      unsub();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [setHasHydrated]);

  useEffect(() => {
    if (!userId) return;
    let source: EventSource | null = null;
    let stopped = false;
    let retry: number | null = null;

    function connect() {
      source = new EventSource("/api/events");
      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            kind?: string;
            task?: Parameters<ReturnType<typeof useWorkspace.getState>["upsertTask"]>[0];
            taskId?: string;
            userId?: string;
          };
          if (data.kind === "task" && data.task) useWorkspace.getState().upsertTask(data.task);
          if (data.kind === "task-removed" && data.taskId) {
            useWorkspace.getState().removeTask(data.taskId);
          }
          if (data.kind === "notification" && data.userId === useWorkspace.getState().user?.id) {
            void refreshNotifications();
          }
        } catch {
          // Ignore a malformed event and keep the stream.
        }
      };
      source.onerror = () => {
        source?.close();
        if (stopped) return;
        retry = window.setTimeout(connect, 5000);
      };
    }

    connect();
    return () => {
      stopped = true;
      if (retry) window.clearTimeout(retry);
      source?.close();
    };
  }, [userId, workspaceId]);

  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
      {children}
    </ThemeProvider>
  );
}
