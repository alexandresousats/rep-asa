"use client";

import {
  CalendarDays,
  ChartColumn,
  FolderKanban,
  Inbox,
  LayoutGrid,
  ListTodo,
  MessageSquare,
  Moon,
  PartyPopper,
  Settings,
  PanelLeft,
  Search,
  Sparkles,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { logout } from "@/lib/api";
import { cn } from "@/lib/cn";
import { sidebarNavIconClass, sidebarNavItemClass } from "@/lib/sidebar-nav";
import { useWorkspace } from "@/lib/workspace";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { NotificationBell } from "./notifications";
import { Logo } from "./logo";
import { WorkspaceDropdown } from "./workspace-dropdown";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/agente", label: "Agente IA", icon: Sparkles, match: "/agente" },
  { href: "/tarefas", label: "Minhas tarefas", icon: ListTodo },
  { href: "/projetos", label: "Projetos", icon: FolderKanban, match: "/projetos" },
  { href: "/demandas", label: "Demandas", icon: Inbox, match: "/demandas" },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/datas-comemorativas", label: "Datas Comemorativas", icon: PartyPopper, match: "/datas-comemorativas" },
  { href: "/mensagens", label: "Mensagens", icon: MessageSquare, match: "/mensagens" },
  { href: "/insights", label: "Insights", icon: ChartColumn },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Sidebar({
  collapsed = false,
  onNavigate,
  onOpenAssistant,
  onOpenSearch,
  onCollapse,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  onOpenAssistant?: () => void;
  onOpenSearch?: () => void;
  onCollapse?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const user = useWorkspace((state) => state.user);
  const workspace = useWorkspace((state) => state.workspace);
  const workspaces = useWorkspace((state) => state.workspaces);
  const tasks = useWorkspace((state) => state.tasks);
  const pendingApprovals = tasks.filter((t) => t.approvalStatus === "pending").length;
  const [creating, setCreating] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-full flex-col overflow-hidden bg-elevated py-4 whitespace-nowrap transition-[width,padding] duration-300 ease-out",
        collapsed ? "w-14 items-center px-0" : "w-[232px] px-3",
      )}
    >
      <div
        className={cn(
          "mb-6 flex items-center",
          collapsed ? "w-full flex-col items-center gap-1" : "justify-between px-1",
        )}
      >
        <span
          className={cn(
            "overflow-hidden transition-all duration-300",
            collapsed ? "hidden" : "max-h-8 max-w-8 opacity-100",
          )}
        >
          <Logo />
        </span>
        <div className={cn("flex items-center", collapsed && "w-full flex-col items-center")}>
          <NotificationBell collapsed={collapsed} />
          <button
            type="button"
            aria-label="Pesquisar"
            onClick={onOpenSearch}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink"
          >
            <Search className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label={collapsed ? "Abrir sidebar" : "Fechar sidebar"}
            onClick={onCollapse}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink"
          >
            <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className={cn("mb-4", collapsed ? "flex justify-center" : "px-1")}>
        <WorkspaceDropdown
          workspace={workspace}
          workspaces={workspaces}
          collapsed={collapsed}
          onCreateWorkspace={() => setCreating(true)}
        />
      </div>

      <nav className={cn("flex flex-1 flex-col gap-1", collapsed && "w-full items-center")}>
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href ||
                (item.match ? pathname.startsWith(item.match) : false);
          const Icon = item.icon;
          const showBadge = item.href === "/demandas" && pendingApprovals > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              onClick={onNavigate}
              className={cn(
                "relative flex items-center rounded-full text-sm transition-colors",
                collapsed ? "h-9 w-9 justify-center" : "gap-3 px-3 py-2",
                sidebarNavItemClass(active),
              )}
            >
              <div className="relative">
                <Icon
                  className={cn("h-4 w-4 shrink-0", sidebarNavIconClass(active))}
                  strokeWidth={active ? 2 : 1.5}
                />
                {collapsed && showBadge && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                )}
              </div>
              <span
                className={cn(
                  "overflow-hidden transition-all duration-300",
                  collapsed ? "hidden" : "max-w-40 opacity-100",
                  active && "text-[var(--sidebar-nav-active-fg)]",
                )}
              >
                {item.label}
              </span>
              {!collapsed && showBadge && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-500">
                  {pendingApprovals}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className={cn("mt-auto", collapsed ? "flex w-full flex-col items-center gap-1" : "space-y-3 px-1")}>
        <button
          type="button"
          title={isDark ? "Modo claro" : "Modo escuro"}
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className={cn(
            "flex items-center rounded-full text-sm text-muted hover:bg-hover hover:text-ink",
            collapsed ? "h-9 w-9 justify-center" : "w-full gap-3 px-3 py-2",
          )}
        >
          {isDark ? (
            <Sun className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          ) : (
            <Moon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          )}
          <span
            className={cn(
              "overflow-hidden transition-all duration-300",
              collapsed ? "hidden" : "max-w-40 opacity-100",
            )}
          >
            {isDark ? "Modo claro" : "Modo escuro"}
          </span>
        </button>

        <div
          className={cn(
            "flex items-center gap-3 rounded-2xl",
            collapsed ? "h-9 w-9 justify-center" : "px-2 py-2",
          )}
        >
          <Avatar initials={user?.initials ?? "AS"} src={user?.avatar} name={user?.name} />
          <div
            className={cn(
              "min-w-0 flex-1 items-center gap-3 overflow-hidden transition-all duration-300",
              collapsed ? "hidden" : "flex max-w-40 opacity-100",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{user?.name ?? "ASA"}</p>
              <p className="truncate text-xs text-faint">{user?.role ?? "Membro"}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void logout().then(() => router.replace("/login"));
              }}
              className="text-[11px] text-faint hover:text-ink"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
      <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />
    </aside>
  );
}
