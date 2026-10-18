"use client";

import { PanelLeft, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { useWorkspace } from "@/lib/workspace";
import { SearchDialog } from "./search-dialog";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const ready = useWorkspace((state) => state.ready);
  const user = useWorkspace((state) => state.user);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  useEffect(() => {
    if (ready && !user) {
      router.replace("/login");
    }
  }, [ready, user, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (!ready || !user) {
    return <div className="min-h-screen bg-base" />;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-base text-ink">
      <div className="hidden h-full shrink-0 md:block">
        <Sidebar
          collapsed={collapsed}
          onOpenAssistant={() => setAssistantOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onCollapse={() => setCollapsed((open) => !open)}
        />
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-[232px]">
            <Sidebar
              onNavigate={() => setMobileOpen(false)}
              onOpenAssistant={() => {
                setAssistantOpen(true);
                setMobileOpen(false);
              }}
              onOpenSearch={() => {
                setSearchOpen(true);
                setMobileOpen(false);
              }}
              onCollapse={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="z-20 flex items-center gap-1 bg-base px-3 py-2 md:hidden">
          <button
            type="button"
            aria-label="Abrir sidebar"
            className="rounded-lg p-1.5 text-faint hover:bg-hover hover:text-ink"
            onClick={() => {
              if (window.matchMedia("(min-width: 768px)").matches) {
                setCollapsed(false);
                return;
              }
              setMobileOpen(true);
            }}
          >
            <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label="Pesquisar"
            className="rounded-lg p-1.5 text-faint hover:bg-hover hover:text-ink"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <AssistantPanel open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
}
