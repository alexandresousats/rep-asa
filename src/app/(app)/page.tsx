"use client";

import { endOfWeek, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import { Heatmap } from "@/components/insights/heatmap";
import { TagChip } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDay, parseDate } from "@/lib/dates";
import { computeInsights } from "@/lib/insights";
import { useWorkspace } from "@/lib/workspace";

export default function OverviewPage() {
  const user = useWorkspace((state) => state.user);
  const tasks = useWorkspace((state) => state.tasks);
  const projects = useWorkspace((state) => state.projects);
  const users = useWorkspace((state) => state.users).filter(
    (person) => person.membershipStatus !== "pending",
  );
  const insights = computeInsights(tasks, projects, users);
  const tags = useWorkspace((state) => state.tags);
  const firstName = user?.name.split(" ")[0] ?? "equipe";
  const weekPosts = useMemo(() => {
    const today = startOfDay(new Date());
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
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
        return due <= weekEnd;
      })
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  }, [tasks]);
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
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <h1 className="mb-10 text-center text-3xl font-medium tracking-tight text-ink">
        Olá, {firstName}.
      </h1>

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
        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm text-faint">Saindo esta semana</p>
          <span className="text-xs text-faint">{weekPosts.length}</span>
        </div>
        {weekPosts.length === 0 ? (
          <p className="text-sm text-faint">Nenhum post com saída até domingo.</p>
        ) : (
          <div className="space-y-1">
            {weekPosts.map((task) => {
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

      <Card className="mb-6 border-none">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm text-faint">Próximas datas importantes</p>
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

      <div className="grid gap-4 md:grid-cols-2">
        <QuickLink href="/projetos" title="Projetos" text="Criar e acompanhar entregas." />
        <QuickLink href="/calendario" title="Calendário" text="Ver o mês da equipe." />
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
