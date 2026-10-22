"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  daysUntil,
  isImportant,
  MONTH_NAMES,
  MONTH_SHORT,
  relativeLabel,
  useOpenDataMonth,
} from "@/lib/opendata";
import { KindBadge } from "./kind-badge";

/** Datas importantes do mês corrente para o dashboard. */
export function MonthHighlights() {
  const today = useMemo(() => new Date(), []);
  const month = today.getMonth() + 1;
  const { data, loading, error, retry } = useOpenDataMonth(month);

  const important = useMemo(
    () => (data ? data.datas.filter(isImportant) : []),
    [data],
  );

  return (
    <Card className="mb-6 border-none">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-faint">
          Datas importantes de {MONTH_NAMES[month - 1].toLowerCase()}
        </p>
        <Link
          href="/datas-comemorativas"
          className="text-xs text-faint hover:text-ink"
        >
          Ver todas
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-faint">Carregando datas…</p>
      ) : error || !data ? (
        <p className="text-sm text-faint">
          Não foi possível carregar as datas.{" "}
          <button
            type="button"
            onClick={retry}
            className="text-ink underline-offset-2 hover:underline"
          >
            Tentar novamente
          </button>
        </p>
      ) : important.length === 0 ? (
        <p className="text-sm text-faint">Nenhuma data importante neste mês.</p>
      ) : (
        <>
          <div className="space-y-1">
            {important.map((item) => {
              const days = daysUntil(item.data, today);
              const past = days < 0;
              return (
                <Link
                  key={item.id}
                  href="/datas-comemorativas"
                  className={cn(
                    "flex items-center gap-4 rounded-xl px-3 py-2.5 transition hover:bg-hover",
                    past && "opacity-50",
                  )}
                >
                  <span className="flex w-10 shrink-0 flex-col items-center leading-none">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-faint">
                      {MONTH_SHORT[item.mes - 1]}
                    </span>
                    <span className="mt-1 text-lg font-medium text-ink">
                      {item.dia}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">
                      {item.titulo}
                    </span>
                    <span className="block text-xs text-faint">
                      {item.dia_semana}
                    </span>
                  </span>
                  <KindBadge kind={item.tipo} className="hidden sm:inline-flex" />
                  <span
                    className={cn(
                      "w-20 shrink-0 text-right text-xs",
                      days === 0 ? "font-medium text-ink" : "text-faint",
                    )}
                  >
                    {relativeLabel(days)}
                  </span>
                </Link>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-faint">
            {data.informacoes.dias_uteis} dias úteis em {data.informacoes.nome.toLowerCase()} ·
            fonte: OpenData BR
          </p>
        </>
      )}
    </Card>
  );
}
