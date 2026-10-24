"use client";

import { ChevronDown, Moon, Search, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { KindBadge } from "@/components/opendata/kind-badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
  buildMonthInsights,
  daysUntil,
  isImportant,
  KIND_META,
  MONTH_NAMES,
  MONTH_SHORT,
  relativeLabel,
  openDataYearOptions,
  useOpenDataMonth,
  useOpenDataMonths,
  type DateKind,
  type OpenDate,
} from "@/lib/opendata";

type Filter = "all" | "important" | DateKind;

const KIND_FILTERS: DateKind[] = [
  "feriado_nacional",
  "ponto_facultativo",
  "campanha",
  "comemorativa",
];

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function DatasComemorativasPage() {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(() => today.getFullYear());
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const months = useOpenDataMonths();
  const dataYear = months.data?.ano ?? today.getFullYear();
  const yearHasData = year === dataYear;
  const detail = useOpenDataMonth(month);

  useEffect(() => {
    if (months.data?.ano != null) setYear(months.data.ano);
  }, [months.data?.ano]);

  const insights = useMemo(
    () => (detail.data ? buildMonthInsights(detail.data, today) : null),
    [detail.data, today],
  );

  const counts = useMemo(() => {
    const result: Record<Filter, number> = {
      all: 0,
      important: 0,
      feriado_nacional: 0,
      ponto_facultativo: 0,
      campanha: 0,
      comemorativa: 0,
    };
    for (const item of detail.data?.datas ?? []) {
      result.all += 1;
      result[item.tipo] += 1;
      if (isImportant(item)) result.important += 1;
    }
    return result;
  }, [detail.data]);

  const visible = useMemo(() => {
    const term = normalize(query.trim());
    return (detail.data?.datas ?? []).filter((item) => {
      if (filter === "important" && !isImportant(item)) return false;
      if (filter !== "all" && filter !== "important" && item.tipo !== filter) {
        return false;
      }
      if (term) {
        return (
          normalize(item.titulo).includes(term) ||
          normalize(item.categoria).includes(term)
        );
      }
      return true;
    });
  }, [detail.data, filter, query]);

  const monthCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of months.data?.meses ?? []) {
      map.set(item.numero, item.total_eventos);
    }
    return map;
  }, [months.data]);

  const apiDown = detail.error;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex min-w-0 flex-wrap items-center gap-x-2 text-2xl font-medium tracking-tight text-ink sm:text-3xl">
          <span>Datas comemorativas ·</span>
          <YearSelect year={year} dataYear={dataYear} onChange={setYear} />
        </h1>
        <MonthSelect
          month={month}
          monthCounts={monthCounts}
          onChange={setMonth}
          disabled={!yearHasData}
        />
      </header>

      {apiDown ? (
        <Card className="border-none py-14 text-center">
          <p className="text-base font-medium text-ink">
            Não foi possível carregar as datas
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-faint">
            A API OpenData BR não respondeu. Suba o serviço com{" "}
            <code className="rounded bg-base px-1 py-0.5">
              docker compose up -d opendata
            </code>{" "}
            e tente novamente.
          </p>
          <button
            type="button"
            onClick={() => {
              detail.retry();
              months.retry();
            }}
            className="mt-4 rounded-xl bg-ink px-4 py-2 text-xs font-medium text-base hover:opacity-90"
          >
            Tentar novamente
          </button>
        </Card>
      ) : (
        <>
          {/* Insights do mês */}
          <Card className="mb-6 border-none">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-faint">
                Insights de {MONTH_NAMES[month - 1].toLowerCase()}
                {yearHasData ? null : ` · ${year}`}
              </p>
              {yearHasData && detail.data?.informacoes.estacao ? (
                <span className="text-xs text-faint">
                  {detail.data.informacoes.estacao}
                </span>
              ) : null}
            </div>

            {!yearHasData ? (
              <p className="text-sm text-faint">
                Calendário de {year} em preparação.
              </p>
            ) : insights ? (
              <>
                <p className="max-w-3xl text-sm leading-relaxed text-ink">
                  {insights.summary}
                </p>

                <div className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-4">
                  <Stat label="Dias úteis" value={insights.workingDays} />
                  <Stat
                    label="Feriados + facultativos"
                    value={insights.holidaysAndOptional}
                  />
                  <Stat
                    label="Próxima data importante"
                    value={
                      insights.nextImportant
                        ? `${insights.nextImportant.dia} ${MONTH_SHORT[insights.nextImportant.mes - 1]} · ${relativeLabel(daysUntil(insights.nextImportant.data, today)).toLowerCase()}`
                        : "Nenhuma restante"
                    }
                    hint={insights.nextImportant?.titulo}
                  />
                  <Stat
                    label="Dia mais movimentado"
                    value={
                      insights.busiestDay
                        ? `Dia ${insights.busiestDay.dia}`
                        : "—"
                    }
                    hint={
                      insights.busiestDay
                        ? `${insights.busiestDay.total} datas comemorativas`
                        : undefined
                    }
                  />
                </div>

                {insights.campaigns.length > 0 ||
                insights.topCategories.length > 0 ||
                insights.fullMoon ||
                insights.newMoon ? (
                  <div className="mt-6 grid gap-5 border-t border-line pt-5 text-xs md:grid-cols-3">
                    {insights.campaigns.length > 0 ? (
                      <div>
                        <p className="text-faint">Campanhas de saúde</p>
                        <ul className="mt-1.5 space-y-1">
                          {insights.campaigns.map((campaign) => (
                            <li key={campaign.nome} className="text-ink">
                              {campaign.nome}
                              <span className="text-faint">
                                {" "}
                                · {campaign.tema}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {insights.topCategories.length > 0 ? (
                      <div>
                        <p className="text-faint">Categorias em destaque</p>
                        <ul className="mt-1.5 space-y-1">
                          {insights.topCategories.map((category) => (
                            <li key={category.name} className="text-ink">
                              {category.name}
                              <span className="text-faint">
                                {" "}
                                · {category.total} datas
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {insights.fullMoon || insights.newMoon ? (
                      <div>
                        <p className="flex items-center gap-1.5 text-faint">
                          <Moon className="h-3 w-3" />
                          Lua
                        </p>
                        <ul className="mt-1.5 space-y-1">
                          {insights.newMoon ? (
                            <li className="text-ink">
                              Lua nova
                              <span className="text-faint">
                                {" "}
                                · dia {insights.newMoon.dia}
                              </span>
                            </li>
                          ) : null}
                          {insights.fullMoon ? (
                            <li className="text-ink">
                              Lua cheia
                              <span className="text-faint">
                                {" "}
                                · dia {insights.fullMoon.dia}
                              </span>
                            </li>
                          ) : null}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-faint">Carregando insights…</p>
            )}
          </Card>

          <p className="mb-6 text-center text-sm text-faint">
            Feriados, campanhas e datas do calendário brasileiro de {year} · fonte:
            OpenData BR
          </p>

          {/* Filtros */}
          {yearHasData ? (
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-faint" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nome ou categoria…"
                aria-label="Buscar datas"
                className="w-full rounded-2xl border border-line bg-elevated py-2 pl-10 pr-9 text-xs text-ink outline-none transition placeholder:text-faint focus:border-ink"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Limpar busca"
                  className="absolute right-3 top-2.5 text-faint hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-line bg-elevated p-1">
              <FilterButton
                active={filter === "all"}
                onClick={() => setFilter("all")}
                label="Todas"
                count={counts.all}
              />
              <FilterButton
                active={filter === "important"}
                onClick={() => setFilter("important")}
                label="Importantes"
                count={counts.important}
              />
              {KIND_FILTERS.map((kind) => (
                <FilterButton
                  key={kind}
                  active={filter === kind}
                  onClick={() => setFilter(kind)}
                  label={KIND_META[kind].plural}
                  count={counts[kind]}
                />
              ))}
            </div>
          </div>
          ) : null}

          {/* Lista */}
          {!yearHasData ? (
            <ComingSoonDates year={year} dataYear={dataYear} />
          ) : detail.loading ? (
            <Card className="border-none py-14 text-center text-sm text-faint">
              Carregando datas…
            </Card>
          ) : visible.length === 0 ? (
            <Card className="border-none py-14 text-center">
              <p className="text-base font-medium text-ink">
                Nenhuma data encontrada
              </p>
              <p className="mt-1 text-xs text-faint">
                Ajuste a busca ou o filtro para ver outras datas.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className="mt-4 rounded-xl bg-ink px-4 py-2 text-xs font-medium text-base hover:opacity-90"
              >
                Limpar filtros
              </button>
            </Card>
          ) : (
            <DateList items={visible} today={today} />
          )}
        </>
      )}
    </div>
  );
}

function DateListItem({ item, today }: { item: OpenDate; today: Date }) {
  const days = daysUntil(item.data, today);
  const important = isImportant(item);
  return (
    <li
      className={cn(
        "flex items-center gap-3.5 rounded-2xl border border-line bg-elevated px-4 py-3 transition hover:bg-hover/60",
        days < 0 && "opacity-55",
      )}
    >
      <span className="flex w-11 shrink-0 flex-col items-center leading-none">
        <span className="text-[10px] font-medium uppercase tracking-wider text-faint">
          {item.dia_semana.slice(0, 3)}
        </span>
        <span
          className={cn(
            "mt-1 text-lg font-medium",
            days === 0 ? "text-ink underline decoration-2" : "text-ink",
          )}
        >
          {item.dia}
        </span>
      </span>

      <span
        className={cn(
          "h-8 w-0.5 shrink-0 rounded-full",
          important ? KIND_META[item.tipo].dot : "bg-line",
        )}
      />

      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-sm",
            important ? "font-medium text-ink" : "text-ink",
          )}
        >
          {item.titulo}
        </span>
        <span className="block truncate text-xs text-faint">
          {item.categoria}
          {days >= 0 && days <= 14 ? (
            <Fragment> · {relativeLabel(days).toLowerCase()}</Fragment>
          ) : null}
        </span>
      </span>

      <KindBadge kind={item.tipo} className="shrink-0" />
    </li>
  );
}

function DateList({ items, today }: { items: OpenDate[]; today: Date }) {
  const midpoint = Math.ceil(items.length / 2);
  const firstCol = items.slice(0, midpoint);
  const secondCol = items.slice(midpoint);

  return (
    <div className="grid grid-cols-1 items-start gap-2.5 sm:gap-3 md:grid-cols-2">
      <ul className="flex flex-col gap-2.5 sm:gap-3">
        {firstCol.map((item) => (
          <DateListItem key={item.id} item={item} today={today} />
        ))}
      </ul>
      <ul className="flex flex-col gap-2.5 sm:gap-3">
        {secondCol.map((item) => (
          <DateListItem key={item.id} item={item} today={today} />
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-faint">{label}</p>
      <p className="mt-1 text-sm text-ink">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

function ComingSoonDates({ year, dataYear }: { year: number; dataYear: number }) {
  return (
    <Card className="border-none py-14 text-center">
      <p className="text-base font-medium text-ink">Em breve</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-faint">
        As datas de {year} ainda não estão disponíveis. Por enquanto, consulte o
        calendário de {dataYear}.
      </p>
    </Card>
  );
}

function YearSelect({
  year,
  dataYear,
  onChange,
}: {
  year: number;
  dataYear: number;
  onChange: (year: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const options = useMemo(() => openDataYearOptions(dataYear), [dataYear]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Selecionar ano"
        className="inline-flex items-center gap-1 rounded-lg px-0.5 py-0.5 font-medium text-ink transition hover:bg-hover"
      >
        <span>{year}</span>
        <ChevronDown
          className={cn("h-5 w-5 text-faint transition sm:h-6 sm:w-6", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Anos"
          className="absolute left-0 top-full z-30 mt-2 min-w-40 overflow-hidden rounded-2xl border border-line bg-elevated p-1 shadow-lg"
        >
          {options.map((option) => {
            const selected = year === option;
            const available = option === dataYear;
            return (
              <li key={option} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition",
                    selected ? "bg-ink text-base" : "text-ink hover:bg-hover",
                  )}
                >
                  <span>{option}</span>
                  {!available ? (
                    <span
                      className={cn(
                        "text-xs",
                        selected ? "opacity-70" : "text-faint",
                      )}
                    >
                      Em breve
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function MonthSelect({
  month,
  monthCounts,
  onChange,
  disabled = false,
}: {
  month: number;
  monthCounts: Map<number, number>;
  onChange: (month: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const selectedName = MONTH_NAMES[month - 1];
  const count = monthCounts.get(month);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Selecionar mês"
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border border-line bg-elevated px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-hover",
          disabled && "cursor-not-allowed opacity-50 hover:bg-elevated",
        )}
      >
        <span>{selectedName}</span>
        {count !== undefined ? (
          <span className="text-xs text-faint">{count}</span>
        ) : null}
        <ChevronDown
          className={cn("h-4 w-4 text-faint transition", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Meses do ano"
          className="absolute right-0 z-30 mt-2 max-h-80 w-56 overflow-y-auto rounded-2xl border border-line bg-elevated p-1 shadow-lg"
        >
          {MONTH_NAMES.map((name, index) => {
            const number = index + 1;
            const selected = month === number;
            const itemCount = monthCounts.get(number);
            return (
              <li key={name} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(number);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                    selected ? "bg-ink text-base" : "text-ink hover:bg-hover",
                  )}
                >
                  <span>{name}</span>
                  {itemCount !== undefined ? (
                    <span
                      className={cn(
                        "text-xs",
                        selected ? "opacity-70" : "text-faint",
                      )}
                    >
                      {itemCount}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-medium transition",
        active ? "bg-ink text-base shadow-xs" : "text-muted hover:text-ink",
      )}
    >
      <span>{label}</span>
      <span className={cn("text-[10px]", active ? "opacity-70" : "text-faint")}>
        {count}
      </span>
    </button>
  );
}
