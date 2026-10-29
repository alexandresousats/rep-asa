"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight, CheckCircle2, Clock, PencilLine, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { getShareSummary, type PublicSummary, type PublicTask } from "@/lib/api/public-share";
import { cn } from "@/lib/cn";
import { parseDate, toISODate } from "@/lib/dates";
import { EmptyMonth } from "./client-calendar";
import { StatusBadge } from "./client-status";

type Loaded = { key: string; summary: PublicSummary } | { key: string; error: string };

export function ClientHome({
  token,
  month,
  version,
  onOpenTask,
  onReview,
  onFailure,
}: {
  token: string;
  month: Date;
  // Muda quando o cliente responde algo, para recarregar os números.
  version: number;
  onOpenTask: (task: PublicTask, list: PublicTask[]) => void;
  onReview: () => void;
  onFailure: (reason: unknown) => boolean;
}) {
  const monthKey = format(month, "yyyy-MM");
  const key = `${monthKey}:${version}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let alive = true;
    getShareSummary(token, monthKey, toISODate(new Date())).then(
      (summary) => {
        if (alive) setLoaded({ key, summary });
      },
      (reason: unknown) => {
        if (!alive || onFailure(reason)) return;
        setLoaded({
          key,
          error: reason instanceof Error ? reason.message : "Não foi possível carregar o resumo.",
        });
      },
    );
    return () => {
      alive = false;
    };
  }, [token, monthKey, key, onFailure]);

  // Ao trocar de mês mostra o esqueleto; depois de uma resposta mantém os números antigos até chegarem os novos.
  const current =
    loaded && (loaded.key === key || loaded.key.startsWith(`${monthKey}:`)) ? loaded : null;
  if (!current) return <HomeSkeleton />;
  if ("error" in current) {
    return <p className="rounded-2xl border border-line p-5 text-sm text-muted">{current.error}</p>;
  }
  const { totals, upcoming, attention, formats } = current.summary;
  if (totals.total === 0 && upcoming.length === 0) return <EmptyMonth month={month} />;

  return (
    <div className="flex flex-col gap-8">
      {totals.pending > 0 ? (
        <button
          type="button"
          onClick={onReview}
          className="group flex items-center gap-4 rounded-3xl bg-amber-500/15 p-5 text-left transition-colors hover:bg-amber-500/20"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white">
            <Clock className="h-6 w-6" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-ink">
              {totals.pending === 1
                ? "1 tarefa aguarda sua aprovação"
                : `${totals.pending} tarefas aguardam sua aprovação`}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-sm font-medium text-amber-700 dark:text-amber-300">
              Revisar agora
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </span>
        </button>
      ) : null}

      <section aria-label="Resumo do mês" className="grid gap-3 md:grid-cols-[1.1fr_2fr]">
        <ProgressCard
          done={totals.donePercent}
          approved={totals.approvedPercent}
          total={totals.total}
        />
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Tarefas no mês" value={totals.total} icon={Sparkles} tone="neutral" />
          <Stat label="Concluídas" value={totals.done} icon={CheckCircle2} tone="sky" />
          <Stat label="Aprovadas" value={totals.approved} icon={CheckCircle2} tone="emerald" />
          <Stat label="Ajustes solicitados" value={totals.changes} icon={PencilLine} tone="rose" />
        </div>
      </section>

      {attention.length > 0 ? (
        <TaskList
          title="Precisa da sua atenção"
          tasks={attention}
          onOpen={(task) => onOpenTask(task, attention)}
        />
      ) : null}

      <TaskList
        title="Próximos 7 dias"
        tasks={upcoming}
        empty="Nenhuma entrega nos próximos 7 dias."
        onOpen={(task) => onOpenTask(task, upcoming)}
      />

      {formats.length > 1 ? (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">Por formato</h2>
          <ul className="flex flex-col gap-2.5">
            {formats.map((item) => (
              <li key={item.name} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 truncate text-muted sm:w-40">{item.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
                  <span
                    className="block h-full rounded-full bg-ink/70"
                    style={{ width: `${(item.count / totals.total) * 100}%` }}
                  />
                </span>
                <span className="w-6 text-right tabular-nums text-ink">{item.count}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ProgressCard({ done, approved, total }: { done: number; approved: number; total: number }) {
  return (
    <div className="flex items-center gap-5 rounded-3xl border border-line bg-elevated p-5">
      <Ring done={done} approved={approved} />
      <div className="flex flex-col gap-2 text-sm">
        <p className="font-semibold text-ink">Progresso do mês</p>
        <p className="flex items-center gap-2 text-muted">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
          {done}% concluído
        </p>
        <p className="flex items-center gap-2 text-muted">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          {approved}% aprovado
        </p>
        <p className="text-xs text-faint">
          {total === 1 ? "1 tarefa" : `${total} tarefas`} no mês
        </p>
      </div>
    </div>
  );
}

function Ring({ done, approved }: { done: number; approved: number }) {
  const outer = 2 * Math.PI * 42;
  const inner = 2 * Math.PI * 30;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0 -rotate-90" role="img" aria-label={`${done}% concluído, ${approved}% aprovado`}>
      <circle cx="50" cy="50" r="42" fill="none" strokeWidth="9" className="stroke-hover" />
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${(done / 100) * outer} ${outer}`}
        opacity={done > 0 ? 1 : 0}
        className="stroke-sky-500 transition-[stroke-dasharray] duration-500"
      />
      <circle cx="50" cy="50" r="30" fill="none" strokeWidth="9" className="stroke-hover" />
      <circle
        cx="50"
        cy="50"
        r="30"
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${(approved / 100) * inner} ${inner}`}
        opacity={approved > 0 ? 1 : 0}
        className="stroke-emerald-500 transition-[stroke-dasharray] duration-500"
      />
    </svg>
  );
}

const TONES = {
  neutral: "text-ink bg-hover",
  sky: "text-sky-700 bg-sky-500/15 dark:text-sky-300",
  emerald: "text-emerald-700 bg-emerald-500/15 dark:text-emerald-300",
  rose: "text-rose-700 bg-rose-500/15 dark:text-rose-300",
} as const;

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
  tone: keyof typeof TONES;
}) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-3xl border border-line bg-elevated p-4">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl", TONES[tone])}>
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <span>
        <span className="block text-3xl font-semibold tabular-nums tracking-tight text-ink">{value}</span>
        <span className="mt-0.5 block text-sm leading-snug text-muted">{label}</span>
      </span>
    </div>
  );
}

function TaskList({
  title,
  tasks,
  empty,
  onOpen,
}: {
  title: string;
  tasks: PublicTask[];
  empty?: string;
  onOpen: (task: PublicTask) => void;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">{title}</h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="overflow-hidden rounded-3xl border border-line bg-elevated">
          {tasks.map((task) => {
            const day = task.dueDate ?? task.startDate;
            return (
              <li key={task.id} className="border-b border-line-subtle last:border-b-0">
                <button
                  type="button"
                  onClick={() => onOpen(task)}
                  className="flex w-full items-center gap-4 px-4 py-3.5 text-left hover:bg-hover"
                >
                  <span className="flex w-11 shrink-0 flex-col items-center leading-none">
                    {day ? (
                      <>
                        <span className="text-[11px] font-semibold uppercase text-faint">
                          {format(parseDate(day), "MMM", { locale: ptBR }).replace(".", "")}
                        </span>
                        <span className="mt-1 text-xl font-semibold tabular-nums text-ink">
                          {format(parseDate(day), "d")}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="line-clamp-2 text-sm font-medium text-ink">{task.title}</span>
                    <StatusBadge task={task} className="self-start" />
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-faint" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando resumo">
      <div className="h-36 animate-pulse rounded-3xl bg-elevated" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-3xl bg-elevated" />
        ))}
      </div>
    </div>
  );
}
