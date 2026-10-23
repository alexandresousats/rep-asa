"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  const [showAll, setShowAll] = useState(false);

  const dates = useMemo(() => {
    if (!data) return [];
    // Prioriza todas as datas importantes
    const importantList = data.datas.filter(isImportant);
    // Se a lista tiver menos de 14 datas, complementa com outras comemorativas relevantes do mês
    if (importantList.length < 14) {
      const remaining = data.datas.filter((item) => !isImportant(item));
      return [...importantList, ...remaining.slice(0, 16 - importantList.length)].sort(
        (a, b) => a.dia - b.dia,
      );
    }
    return importantList;
  }, [data]);

  const visibleDates = showAll ? dates : dates.slice(0, 10);

  return (
    <Card className="mb-6 border-none">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-faint">
          Datas importantes de {MONTH_NAMES[month - 1].toLowerCase()}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-faint">{dates.length}</span>
          {dates.length > 10 ? (
            <button
              type="button"
              onClick={() => setShowAll((open) => !open)}
              className="text-xs text-faint hover:text-ink cursor-pointer"
            >
              {showAll ? "Mostrar menos" : "Ver mais"}
            </button>
          ) : null}
          <Link
            href="/datas-comemorativas"
            className="text-xs text-faint hover:text-ink"
          >
            Ver todas
          </Link>
        </div>
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
      ) : dates.length === 0 ? (
        <p className="text-sm text-faint">Nenhuma data importante neste mês.</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {visibleDates.map((item) => {
              const days = daysUntil(item.data, today);
              const past = days < 0;
              return (
                <Link
                  key={item.id}
                  href="/datas-comemorativas"
                  className={cn(
                    "flex items-center gap-3.5 rounded-xl px-3 py-2.5 transition hover:bg-hover",
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
                    <span className="block truncate text-xs text-faint">
                      {item.categoria}
                    </span>
                  </span>
                  <KindBadge kind={item.tipo} className="hidden sm:inline-flex shrink-0" />
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
