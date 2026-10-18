"use client";

import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { loadSession, refreshNotifications } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";

export function Providers({ children }: { children: React.ReactNode }) {
  const setHasHydrated = usePrefs((state) => state.setHasHydrated);

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

  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
      {children}
    </ThemeProvider>
  );
}
