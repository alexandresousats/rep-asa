"use client";

import { endOfWeek, format, startOfDay, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, SquarePen } from "lucide-react";
import { Heatmap } from "@/components/insights/heatmap";
import { MonthHighlights } from "@/components/opendata/month-highlights";
import { TagChip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDay, parseDate } from "@/lib/dates";
import { computeInsights } from "@/lib/insights";
import { useWorkspace } from "@/lib/workspace";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatThread } from "@/components/chat/chat-thread";
import { useChat } from "@/lib/chat";
import { agentReady, usePrefs } from "@/lib/prefs";

const SUGGESTIONS = [
  "Criar uma tarefa para amanhã",
  "Quais tarefas estão atrasadas?",
  "O que vence esta semana?",
];

export default function OverviewPage() {
  const messages = useChat((state) => state.messages);

  if (messages.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <ChatHero />
        <Dashboard />
      </div>
    );
  }
  return <ChatScreen />;
}

function ChatHero() {
  const user = useWorkspace((state) => state.user);
  const agent = usePrefs((state) => state.agent);
  const send = useChat((state) => state.send);
  const firstName = user?.name.split(" ")[0] ?? "equipe";
  const ready = agentReady(agent);

  return (
    <section className="mx-auto mb-12 flex w-full max-w-3xl flex-col items-center pt-6 sm:pt-10">
      <h1 className="mb-6 sm:mb-8 text-center text-3xl font-medium tracking-tight text-ink">
        Olá, {firstName}.
      </h1>
      <ChatComposer hero autoFocus className="w-full" />
      {ready ? (
        <div className="mt-5 flex w-full items-center justify-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {SUGGESTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => void send(item)}
              className="shrink-0 whitespace-nowrap rounded-full border border-line px-3.5 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm text-muted transition-colors hover:bg-hover hover:text-ink"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-5 flex items-center justify-center">
        <Link
          href="/agente"
          className="flex items-center gap-1.5 text-xs text-faint hover:text-ink transition-colors"
        >
          <span>Abrir espaço do Agente IA (com pastas, áudios e histórico)</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

function ChatScreen() {
  const messages = useChat((state) => state.messages);
  const reset = useChat((state) => state.reset);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-line-subtle px-6 py-3">
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium text-ink">Agente ASA</p>
          <Link
            href="/agente"
            className="flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors"
          >
            <span>Modo completo</span>
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <SquarePen className="h-4 w-4" strokeWidth={1.5} />
          Nova conversa
        </button>
      </div>
      <div data-chat-scroll className="min-h-0 flex-1 overflow-y-auto px-6">
        <ChatThread messages={messages} className="mx-auto w-full max-w-3xl py-6" />
      </div>
      <div className="shrink-0 px-6 pt-2 pb-5">
        <ChatComposer autoFocus className="mx-auto w-full max-w-3xl" />
      </div>
    </div>
  );
}

function Dashboard() {
  const user = useWorkspace((state) => state.user);
  const tasks = useWorkspace((state) => state.tasks);
  const projects = useWorkspace((state) => state.projects);
  const users = useWorkspace((state) => state.users).filter(
    (person) => person.membershipStatus !== "pending",
  );
  const insights = computeInsights(tasks, projects, users);
  const tags = useWorkspace((state) => state.tags);
  const firstName = user?.name.split(" ")[0] ?? "equipe";
  const [showAllWeek, setShowAllWeek] = useState(false);
  const weekPosts = useMemo(() => {
    const today = startOfDay(new Date());
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = startOfDay(endOfWeek(today, { weekStartsOn: 1 }));
    return tasks
      .filter((task) => {
        if (
          task.id.startsWith("hist-") ||
          task.parentId ||
          task.status === "done" ||
          !task.dueDate
        ) {
          return false;
        }
        const due = startOfDay(parseDate(task.dueDate));
        return due >= weekStart && due <= weekEnd;
      })
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  }, [tasks]);
  const visibleWeekPosts = showAllWeek ? weekPosts : weekPosts.slice(0, 10);
  const upcomingDates = useMemo(() => {
    const today = startOfDay(new Date());
    const year = today.getFullYear();
    return tasks
      .filter((task) => {
        if (
          task.id.startsWith("hist-") ||
          task.parentId ||
          task.status === "done" ||
          !task.dueDate
        ) {
          return false;
        }
        if (task.priority !== "alta" && task.priority !== "urgente") return false;
        const due = startOfDay(parseDate(task.dueDate));
        return due.getFullYear() === year && due >= today;
      })
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
      .slice(0, 6);
  }, [tasks]);

  return (
    <div>
      <Card className="mb-6 border-none">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-faint">Todas as entregas</p>
            <p className="mt-1 text-3xl font-medium tracking-tight text-ink">
              {insights.totalCompleted.toLocaleString("pt-BR")}
            </p>
          </div>
        </div>
        <Heatmap cells={insights.heatmap} />
        <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat label="Mês mais ativo" value={insights.mostActiveMonth} />
          <Stat label="Dia mais ativo" value={insights.mostActiveWeekday} />
          <Stat
            label="Maior sequência"
            value={`${insights.longestStreak} dias`}
          />
          <Stat
            label="Sequência atual"
            value={`${insights.currentStreak} dia`}
          />
        </div>
      </Card>

      <Card className="mb-6 border-none">
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="text-sm text-faint">Saindo esta semana</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-faint">{weekPosts.length}</span>
            {weekPosts.length > 10 ? (
              <button
                type="button"
                onClick={() => setShowAllWeek((open) => !open)}
                className="text-xs text-faint hover:text-ink"
              >
                {showAllWeek ? "Mostrar menos" : "Ver todas"}
              </button>
            ) : null}
          </div>
        </div>
        {weekPosts.length === 0 ? (
          <p className="text-sm text-faint">Nenhum post saindo esta semana.</p>
        ) : (
          <div className="space-y-1">
            {visibleWeekPosts.map((task) => {
              const project = projects.find((item) => item.id === task.projectId);
              const assignee = users.find((item) => item.id === task.assigneeId);
              const tag = tags.find((item) => item.id === task.tagIds[0]);
              const overdue = task.dueDate
                ? startOfDay(parseDate(task.dueDate)) < startOfDay(new Date())
                : false;
              return (
                <Link
                  key={task.id}
                  href={`/projetos/${task.projectId}?task=${task.id}`}
                  className="flex items-center gap-4 rounded-2xl px-2 py-2.5 hover:bg-hover"
                >
                  <span className="w-16 shrink-0 text-xs capitalize text-faint">
                    {task.dueDate ? formatDay(task.dueDate) : "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{task.title}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-faint">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: project?.color }}
                      />
                      {project?.name}
                      {overdue ? <span>atrasado</span> : null}
                    </span>
                  </span>
                  {tag ? <TagChip name={tag.name} color={tag.color} /> : null}
                  <span className="hidden w-20 shrink-0 text-right text-xs text-faint sm:block">
                    {assignee?.name.split(" ")[0]}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      <MonthHighlights />

      <Card className="mb-6 border-none">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm text-faint">Próximas datas importantes da equipe</p>
          <Link href="/calendario" className="text-xs text-faint hover:text-ink">
            {new Date().getFullYear()}
          </Link>
        </div>
        {upcomingDates.length === 0 ? (
          <p className="text-sm text-faint">Nenhuma data importante no restante do ano.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {upcomingDates.map((task) => {
              const project = projects.find((item) => item.id === task.projectId);
              const due = parseDate(task.dueDate as string);
              return (
                <Link
                  key={task.id}
                  href={`/projetos/${task.projectId}?task=${task.id}`}
                  className="flex items-center gap-4 rounded-2xl px-2 py-2.5 hover:bg-hover"
                >
                  <span className="w-12 shrink-0 text-center">
                    <span className="block text-lg font-medium leading-none text-ink">
                      {format(due, "d")}
                    </span>
                    <span className="mt-1 block text-[11px] capitalize text-faint">
                      {format(due, "MMM", { locale: ptBR })}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{task.title}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-faint">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: project?.color }}
                      />
                      {project?.name}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <Card className="border-none">
          <p className="mb-5 text-sm text-faint">Projetos</p>
          <div className="space-y-4">
            {insights.projectProgress.map((item) => {
              const project = projects.find((p) => p.id === item.projectId);
              if (!project) return null;
              return (
                <Link
                  key={project.id}
                  href={`/projetos/${project.id}`}
                  className="block"
                >
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-ink">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      {project.name}
                    </span>
                    <span className="text-faint">{item.percent}%</span>
                  </div>
                  <div className="h-px bg-line">
                    <div
                      className="h-px bg-ink"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>

        <Card className="border-none">
          <p className="mb-5 text-sm text-faint">Carga da equipe</p>
          <div className="space-y-4">
            {insights.memberLoad.map((item) => {
              const member = users.find((userItem) => userItem.id === item.userId);
              if (!member) return null;
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-ink">{member.name}</span>
                  <span className="text-faint">
                    {item.done} feitas · {item.open} abertas
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <QuickLink href="/projetos" title="Projetos" text="Criar e acompanhar entregas." />
        <QuickLink href="/calendario" title="Calendário" text="Ver o mês da equipe." />
        <QuickLink href="/datas-comemorativas" title="Datas Comemorativas" text="Feriados, campanhas e datas do ano." />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-faint">{label}</p>
      <p className="mt-1 capitalize text-sm text-ink">{value}</p>
    </div>
  );
}

function QuickLink({
  href,
  title,
  text,
}: {
  href: string;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start justify-between rounded-[20px] bg-elevated p-5 hover:bg-hover"
    >
      <div>
        <p className="text-sm text-ink">{title}</p>
        <p className="mt-1 text-sm text-faint">{text}</p>
      </div>
      <ArrowUpRight className="h-4 w-4 text-faint" />
    </Link>
  );
}
