"use client";

import { addMonths, endOfMonth, startOfMonth, subMonths } from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  House,
  LinkIcon,
  MessageSquarePlus,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DemandChat, type DemandChatApi } from "@/components/demands/demand-chat";
import { ApiError } from "@/lib/api/client";
import {
  chatShareDemand,
  getShareDemandInfo,
  getShareInfo,
  listShareTasks,
  ShareLockedError,
  ShareUnavailableError,
  submitShareDemand,
  type PublicBrand,
  type PublicTask,
} from "@/lib/api/public-share";
import { cn } from "@/lib/cn";
import { formatMonthTitle, toISODate } from "@/lib/dates";
import { BrandMark } from "./brand-mark";
import { ClientCalendar, type ApprovalFilter } from "./client-calendar";
import { ClientHome } from "./client-home";
import { PinScreen } from "./pin-screen";
import { readIdentity, TaskSheet } from "./task-sheet";

type Tab = "inicio" | "calendario" | "solicitar";

type View =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "unavailable" }
  | { kind: "locked"; workspace: PublicBrand }
  | { kind: "open"; project: { name: string; color: string }; workspace: PublicBrand };

type MonthTasks = { key: string; tasks: PublicTask[]; undated: PublicTask[] } | null;

const TABS: { id: Tab; label: string; icon: typeof House }[] = [
  { id: "inicio", label: "Início", icon: House },
  { id: "calendario", label: "Calendário", icon: CalendarDays },
  { id: "solicitar", label: "Solicitar", icon: MessageSquarePlus },
];

function readTab(value: string | null): Tab {
  return value === "calendario" || value === "solicitar" ? value : "inicio";
}

export function ClientSharePage({ token }: { token: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = readTab(searchParams.get("tab"));
  const [view, setView] = useState<View>({ kind: "loading" });
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [monthTasks, setMonthTasks] = useState<MonthTasks>(null);
  const [tasksError, setTasksError] = useState("");
  const [opened, setOpened] = useState<{ id: string; list: PublicTask[] } | null>(null);
  const [summaryVersion, setSummaryVersion] = useState(0);
  const [calendarFilter, setCalendarFilter] = useState<ApprovalFilter>("all");
  const monthKey = toISODate(month);

  const loadInfo = useCallback(
    () =>
      getShareInfo(token).then(
        (info) => setView(info),
        (reason: unknown) =>
          setView(
            reason instanceof ApiError && reason.status === 404
              ? { kind: "invalid" }
              : { kind: "unavailable" },
          ),
      ),
    [token],
  );

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  const handleFailure = useCallback(
    (reason: unknown) => {
      // Sessão expirada ou PIN trocado: volta para a tela de PIN.
      if (reason instanceof ShareLockedError) {
        setView((current) =>
          current.kind === "open" ? { kind: "locked", workspace: current.workspace } : current,
        );
        return true;
      }
      if (reason instanceof ShareUnavailableError) {
        setView({ kind: "unavailable" });
        return true;
      }
      if (reason instanceof ApiError && reason.status === 404) {
        setView({ kind: "invalid" });
        return true;
      }
      return false;
    },
    [],
  );

  const reloadTasks = useCallback(() => {
    const from = toISODate(startOfMonth(month));
    const to = toISODate(endOfMonth(month));
    return listShareTasks(token, { from, to, includeUndated: true }).then(
      (all) => {
        setMonthTasks({
          key: from,
          tasks: all.filter((task) => task.startDate || task.dueDate),
          undated: all.filter((task) => !task.startDate && !task.dueDate),
        });
        setTasksError("");
      },
      (reason: unknown) => {
        if (!handleFailure(reason)) {
          setTasksError(reason instanceof Error ? reason.message : "Não foi possível carregar.");
        }
      },
    );
  }, [token, month, handleFailure]);

  const demandApi = useMemo<DemandChatApi>(() => {
    // Sessão expirada no meio do chat volta para a tela de PIN, como nas outras abas.
    const guard = <T,>(work: Promise<T>) =>
      work.catch((reason: unknown) => {
        handleFailure(reason);
        throw reason;
      });
    return {
      info: () => guard(getShareDemandInfo(token)),
      chat: (messages, state) => guard(chatShareDemand(token, messages, { ...state })),
      submit: (demand) => guard(submitShareDemand(token, { ...demand })),
    };
  }, [token, handleFailure]);

  const isOpen = view.kind === "open";
  useEffect(() => {
    if (isOpen) void reloadTasks();
  }, [isOpen, reloadTasks]);

  const openTask = useCallback(
    (task: PublicTask, list: PublicTask[]) => setOpened({ id: task.id, list }),
    [],
  );

  function replaceTask(updated: PublicTask) {
    const swap = (items: PublicTask[]) =>
      items.map((item) => (item.id === updated.id ? updated : item));
    setMonthTasks((current) =>
      current
        ? { ...current, tasks: swap(current.tasks), undated: swap(current.undated) }
        : current,
    );
    setOpened((current) => (current ? { ...current, list: swap(current.list) } : current));
    setSummaryVersion((value) => value + 1);
  }

  function setTab(next: Tab, filter: ApprovalFilter = "all") {
    setCalendarFilter(filter);
    if (next === "solicitar") setOpened(null);
    const query = new URLSearchParams(searchParams.toString());
    query.set("tab", next);
    router.replace(`?${query.toString()}`, { scroll: false });
  }

  if (view.kind === "loading") return <PageSkeleton />;
  if (view.kind === "invalid") {
    return (
      <Notice
        title="Este link não está mais disponível"
        text="Ele pode ter expirado ou sido desativado. Peça um novo link para a equipe que enviou."
      />
    );
  }
  if (view.kind === "unavailable") {
    return (
      <Notice
        title="Calendário indisponível no momento"
        text="Este calendário está temporariamente fora do ar. Tente de novo mais tarde ou fale com a equipe que enviou o link."
      />
    );
  }
  if (view.kind === "locked") {
    return (
      <PinScreen
        token={token}
        workspace={view.workspace}
        onUnlocked={() => {
          setView({ kind: "loading" });
          void loadInfo();
        }}
      />
    );
  }

  // O chat ocupa a tela toda; nada do calendário fica montado por baixo.
  if (tab === "solicitar") {
    const who = readIdentity();
    return (
      <DemandChat
        api={demandApi}
        variant="client"
        requester={who ? { name: who.clientName, email: who.clientEmail } : undefined}
        onBack={() => setTab("inicio")}
        onSubmitted={() => {
          void reloadTasks();
          setSummaryVersion((value) => value + 1);
        }}
      />
    );
  }

  const current = monthTasks?.key === monthKey ? monthTasks : null;

  return (
    <div className="min-h-dvh pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-10">
      <header className="border-b border-line-subtle">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pt-5 pb-4 sm:px-6 sm:pt-8">
          <div className="flex items-center gap-3">
            <BrandMark brand={view.workspace} />
            <span className="min-w-0 truncate text-sm font-medium text-muted">
              {view.workspace.name}
            </span>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: view.project.color }}
                />
                <h1 className="truncate text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  {view.project.name}
                </h1>
              </div>
              <p className="mt-1 text-sm text-muted">Calendário de conteúdo</p>
            </div>
            <MonthSwitcher
              month={month}
              onChange={setMonth}
            />
          </div>
          <nav
            aria-label="Seções"
            className="hidden w-fit gap-1 rounded-full bg-elevated p-1 sm:flex"
          >
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition-colors",
                  tab === item.id ? "bg-ink text-base" : "text-muted hover:text-ink",
                )}
              >
                <item.icon className="h-4 w-4" strokeWidth={1.75} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {tasksError ? (
          <div className="rounded-2xl border border-line p-5 text-sm text-muted">
            {tasksError}{" "}
            <button
              type="button"
              onClick={() => void reloadTasks()}
              className="font-medium text-ink underline underline-offset-4"
            >
              Tentar de novo
            </button>
          </div>
        ) : tab === "inicio" ? (
          <ClientHome
            token={token}
            month={month}
            version={summaryVersion}
            onOpenTask={openTask}
            onReview={() => setTab("calendario", "pending")}
            onFailure={handleFailure}
          />
        ) : current === null ? (
          <ListSkeleton />
        ) : (
          <ClientCalendar
            token={token}
            month={month}
            onMonthChange={setMonth}
            tasks={current.tasks}
            undated={current.undated}
            initialFilter={calendarFilter}
            onOpenTask={openTask}
          />
        )}
      </main>

      {opened
        ? (() => {
            const task = opened.list.find((item) => item.id === opened.id);
            return task ? (
              <TaskSheet
                key={task.id}
                token={token}
                task={task}
                list={opened.list}
                onNavigate={(next) => setOpened({ ...opened, id: next.id })}
                onClose={() => setOpened(null)}
                onUpdated={replaceTask}
              />
            ) : null;
          })()
        : null}

      <footer className="mx-auto max-w-5xl px-4 pb-6 text-center text-xs text-faint sm:px-6">
        Feito com OpenAsa
      </footer>

      <nav
        aria-label="Seções"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <div className="grid grid-cols-3">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium",
                tab === item.id ? "text-ink" : "text-faint",
              )}
            >
              <item.icon className="h-5 w-5" strokeWidth={tab === item.id ? 2.25 : 1.75} />
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function MonthSwitcher({ month, onChange }: { month: Date; onChange: (month: Date) => void }) {
  const raw = formatMonthTitle(month);
  const title = raw.charAt(0).toUpperCase() + raw.slice(1);
  return (
    <div className="flex items-center gap-1 rounded-full border border-line p-1">
      <button
        type="button"
        aria-label="Mês anterior"
        onClick={() => onChange(subMonths(month, 1))}
        className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-36 text-center text-sm font-medium text-ink" aria-live="polite">
        {title}
      </span>
      <button
        type="button"
        aria-label="Próximo mês"
        onClick={() => onChange(addMonths(month, 1))}
        className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-elevated">
          <LinkIcon className="h-5 w-5 text-muted" strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 text-lg font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
      </div>
    </main>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6" aria-busy="true" aria-label="Carregando">
      <div className="h-9 w-40 animate-pulse rounded-xl bg-elevated" />
      <div className="mt-6 h-8 w-64 animate-pulse rounded-xl bg-elevated" />
      <div className="mt-10">
        <ListSkeleton />
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando tarefas">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-20 animate-pulse rounded-2xl bg-elevated" />
      ))}
    </div>
  );
}
