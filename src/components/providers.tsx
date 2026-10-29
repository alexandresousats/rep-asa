"use client";

import { ThemeProvider } from "next-themes";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { loadSession, refreshNotifications, syncWorkspaceAgent } from "@/lib/api";
import { useChat } from "@/lib/chat";
import { enableFirebaseAnalytics } from "@/lib/firebase";
import { agentReady, usePrefs } from "@/lib/prefs";
import { useAccess, useWorkspace } from "@/lib/workspace";

// A página do link do cliente não tem sessão do app e segue o tema do sistema.
export function isClientSharePath(pathname: string | null) {
  return pathname?.startsWith("/c/") ?? false;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const isPublicShare = isClientSharePath(usePathname());
  const setHasHydrated = usePrefs((state) => state.setHasHydrated);
  const userId = useWorkspace((state) => state.user?.id);
  const workspaceId = useWorkspace((state) => state.workspace?.id);
  const billingActive = useWorkspace((state) => state.billing?.active === true);
  const agent = usePrefs((state) => state.agent);
  const prefsHydrated = usePrefs((state) => state.hasHydrated);
  const { canWrite } = useAccess();

  useEffect(() => {
    if (usePrefs.persist.hasHydrated()) {
      setHasHydrated(true);
    }
    const unsub = usePrefs.persist.onFinishHydration(() => {
      setHasHydrated(true);
    });
    if (isPublicShare) return unsub;
    void loadSession();
    void enableFirebaseAnalytics().catch(() => undefined);
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
  }, [setHasHydrated, isPublicShare]);

  // Conversas e chaves do agente são de cada pessoa em cada espaço; nada passa para quem entra depois.
  useEffect(() => {
    if (isPublicShare) return;
    if (!userId) {
      useChat.getState().clear();
      return;
    }
    if (prefsHydrated) usePrefs.getState().claimFor(userId);
    if (workspaceId) void useChat.getState().hydrate(userId, workspaceId);
  }, [userId, workspaceId, prefsHydrated, isPublicShare]);

  useEffect(() => {
    if (!userId || !workspaceId || !prefsHydrated || !canWrite || !billingActive) return;
    if (!agentReady(agent)) return;
    // Só sincroniza chaves que são de quem está logado.
    if (usePrefs.getState().ownerId !== userId) return;
    void syncWorkspaceAgent({
      baseUrl: agent.baseUrl.trim(),
      apiKey: agent.apiKey.trim(),
      model: agent.model.trim(),
    }).catch(() => undefined);
  }, [userId, workspaceId, prefsHydrated, canWrite, billingActive, agent.baseUrl, agent.apiKey, agent.model]);

  useEffect(() => {
    const locked = Boolean(workspaceId) && !billingActive;
    if (!userId || locked) return;
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
  }, [userId, workspaceId, billingActive]);

  return (
    <ThemeProvider
      attribute={["class", "data-theme"]}
      defaultTheme={isPublicShare ? "system" : "dark"}
      enableSystem={isPublicShare}
      storageKey={isPublicShare ? "asa-share-theme" : "theme"}
    >
      {children}
    </ThemeProvider>
  );
}
