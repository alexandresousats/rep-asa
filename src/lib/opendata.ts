"use client";

import { differenceInCalendarDays, startOfDay } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { parseDate } from "@/lib/dates";

/**
 * Cliente da API OpenData BR (https://github.com/alexandresousats/api-opendata.br).
 * As chamadas passam pelo proxy do Next (`/opendata/*` -> API em :8000/api/v1/*).
 */

export type DateKind =
  | "feriado_nacional"
  | "ponto_facultativo"
  | "campanha"
  | "comemorativa";

export interface OpenDate {
  id: string;
  ano: number;
  mes: number;
  dia: number;
  data: string; // YYYY-MM-DD
  dia_semana: string;
  titulo: string;
  tipo: DateKind;
  categoria: string;
  descricao?: string;
}

export interface HealthCampaign {
  nome: string;
  tema: string;
  periodo: string;
}

export interface MoonPhase {
  mes: number;
  dia: number;
  data: string;
  fase: string;
}

export interface MonthInfo {
  numero: number;
  nome: string;
  dias_totais: number;
  dias_uteis: number;
  campanhas_saude: HealthCampaign[];
  feriados_nacionais?: string[];
  pontos_facultativos?: string[];
  estacao?: string;
}

export interface MonthDetail {
  informacoes: MonthInfo;
  fases_lua: MoonPhase[];
  total_eventos: number;
  datas: OpenDate[];
}

export interface MonthSummary extends MonthInfo {
  total_eventos: number;
  feriados_nacionais_qtd: number;
  pontos_facultativos_qtd: number;
  datas_comemorativas_qtd: number;
  fases_lua: MoonPhase[];
}

export interface MonthsResponse {
  ano: number;
  total_meses: number;
  meses: MonthSummary[];
}

export const KIND_META: Record<
  DateKind,
  { label: string; plural: string; chip: string; dot: string }
> = {
  feriado_nacional: {
    label: "Feriado nacional",
    plural: "Feriados",
    chip: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  ponto_facultativo: {
    label: "Ponto facultativo",
    plural: "Facultativos",
    chip: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    dot: "bg-purple-500",
  },
  campanha: {
    label: "Campanha de saúde",
    plural: "Campanhas",
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  comemorativa: {
    label: "Data comemorativa",
    plural: "Comemorativas",
    chip: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
    dot: "bg-pink-500",
  },
};

export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const MONTH_SHORT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

/** Datas comemorativas populares que também contam como "importantes". */
const POPULAR_TITLE =
  /^(dia das mães|dia dos pais|dia dos namorados|dia das crianças|dia do consumidor|dia mundial do consumidor|dia internacional da mulher|dia do professor|dia do trabalhador|dia dos avós|dia do cliente|dia da consciência negra|páscoa|halloween|black friday|natal|véspera de natal|réveillon|ano novo)\b/i;

/** Importantes = feriados, pontos facultativos, campanhas de saúde e as comemorativas populares. */
export function isImportant(item: OpenDate) {
  return item.tipo !== "comemorativa" || POPULAR_TITLE.test(item.titulo);
}

// --- Acesso à API -----------------------------------------------------------

const requestCache = new Map<string, Promise<unknown>>();

function getJSON<T>(path: string): Promise<T> {
  const cached = requestCache.get(path) as Promise<T> | undefined;
  if (cached) return cached;

  const request = fetch(`/opendata${path}`).then((res) => {
    if (!res.ok) throw new Error(`OpenData BR respondeu ${res.status}`);
    return res.json() as Promise<T>;
  });
  // Não mantém falhas em cache, para permitir "tentar novamente".
  request.catch(() => requestCache.delete(path));
  requestCache.set(path, request);
  return request;
}

interface ResourceState<T> {
  path: string | null;
  data?: T;
  failed?: boolean;
}

function useResource<T>(path: string | null) {
  const [state, setState] = useState<ResourceState<T>>({ path: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    getJSON<T>(path)
      .then((data) => {
        if (!cancelled) setState({ path, data });
      })
      .catch(() => {
        if (!cancelled) setState({ path, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [path, attempt]);

  const retry = useCallback(() => {
    setState({ path: null });
    setAttempt((value) => value + 1);
  }, []);

  const settled = path !== null && state.path === path;
  return {
    data: settled ? state.data : undefined,
    error: settled && state.failed === true,
    loading: path !== null && !settled,
    retry,
  };
}

export function useOpenDataMonth(month: number) {
  return useResource<MonthDetail>(`/meses/${month}`);
}

export function useOpenDataMonths() {
  return useResource<MonthsResponse>("/meses");
}

// --- Datas e insights -------------------------------------------------------

export function daysUntil(isoDate: string, today: Date = new Date()) {
  return differenceInCalendarDays(parseDate(isoDate), startOfDay(today));
}

export function relativeLabel(days: number) {
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanhã";
  if (days > 1) return `Em ${days} dias`;
  return "Já passou";
}

export function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function groupCount<T>(items: T[], key: (item: T) => string | number) {
  const counts = new Map<string | number, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export interface MonthInsights {
  summary: string;
  workingDays: string;
  holidaysAndOptional: string;
  nextImportant: OpenDate | null;
  busiestDay: { dia: number; total: number } | null;
  topCategories: { name: string; total: number }[];
  campaigns: HealthCampaign[];
  fullMoon: MoonPhase | null;
  newMoon: MoonPhase | null;
}

export function buildMonthInsights(
  detail: MonthDetail,
  today: Date = new Date(),
): MonthInsights {
  const { informacoes: info, datas, fases_lua } = detail;
  const holidays = datas.filter((d) => d.tipo === "feriado_nacional");
  const optional = datas.filter((d) => d.tipo === "ponto_facultativo");
  const commemorative = datas.filter((d) => d.tipo === "comemorativa");

  const nextImportant =
    datas.find(
      (d) => d.tipo !== "campanha" && isImportant(d) && daysUntil(d.data, today) >= 0,
    ) ?? null;

  let busiestDay: MonthInsights["busiestDay"] = null;
  for (const [dia, total] of groupCount(commemorative, (d) => d.dia)) {
    if (!busiestDay || total > busiestDay.total) {
      busiestDay = { dia: Number(dia), total };
    }
  }

  const topCategories = [...groupCount(commemorative, (d) => d.categoria)]
    .map(([name, total]) => ({ name: String(name), total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, 3);

  const parts = [
    `${info.nome} tem ${info.dias_uteis} dias úteis em ${info.dias_totais} dias`,
    `${plural(holidays.length, "feriado nacional", "feriados nacionais")} e ${plural(optional.length, "ponto facultativo", "pontos facultativos")}.`,
  ];
  let summary = `${parts[0]}, ${parts[1]}`;
  if (info.campanhas_saude.length > 0) {
    summary += ` Mês de ${info.campanhas_saude.map((c) => c.nome).join(" e ")}.`;
  }
  if (topCategories[0]) {
    summary += ` A categoria com mais datas é ${topCategories[0].name}.`;
  }

  return {
    summary,
    workingDays: `${info.dias_uteis} de ${info.dias_totais}`,
    holidaysAndOptional: `${holidays.length} + ${optional.length}`,
    nextImportant,
    busiestDay,
    topCategories,
    campaigns: info.campanhas_saude,
    fullMoon: fases_lua.find((f) => /cheia/i.test(f.fase)) ?? null,
    newMoon: fases_lua.find((f) => /nova/i.test(f.fase)) ?? null,
  };
}
