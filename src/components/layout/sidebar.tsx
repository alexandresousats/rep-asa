"use client";

import {
  CalendarDays,
  FolderKanban,
  Hash,
  LayoutGrid,
  Moon,
  Settings,
  PanelLeft,
  Search,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { logout } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/lib/workspace";
import { NotificationBell } from "./notifications";
import { Logo } from "./logo";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/projetos", label: "Projetos", icon: FolderKanban, match: "/projetos" },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/tags", label: "Tags", icon: Hash },
  { href: "/equipe", label: "Equipe", icon: Users },
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

      <nav className={cn("flex flex-1 flex-col gap-1", collapsed && "w-full items-center")}>
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href ||
                (item.match ? pathname.startsWith(item.match) : false);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              onClick={onNavigate}
              className={cn(
                "flex items-center rounded-full text-sm transition-colors",
                collapsed ? "h-9 w-9 justify-center" : "gap-3 px-3 py-2",
                active
                  ? "bg-active text-ink"
                  : "text-muted hover:bg-hover hover:text-ink",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span
                className={cn(
                  "overflow-hidden transition-all duration-300",
                  collapsed ? "hidden" : "max-w-40 opacity-100",
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className={cn("mt-auto", collapsed ? "flex w-full flex-col items-center gap-1" : "space-y-3 px-1")}>
        <button
          type="button"
          title="Assistente"
          onClick={() => {
            onOpenAssistant?.();
            onNavigate?.();
          }}
          className={cn(
            "flex items-center rounded-full text-sm text-muted hover:bg-hover hover:text-ink",
            collapsed ? "h-9 w-9 justify-center" : "w-full gap-3 px-3 py-2",
          )}
        >
          <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          <span
            className={cn(
              "overflow-hidden transition-all duration-300",
              collapsed ? "hidden" : "max-w-40 opacity-100",
            )}
          >
            Assistente
          </span>
        </button>
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
    </aside>
  );
}
