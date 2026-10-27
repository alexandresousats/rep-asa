export const INCLUDED_PEOPLE = 5;
export const MAX_PEOPLE = 15;
export const PACK_SIZE = 5;

export type BillingPeriod = "month" | "quarter";

export const SEAT_PRICES = {
  month: { base: 990, single: 300, pack: 990 },
  quarter: { base: 2822, single: 855, pack: 2822 },
} as const;

export type SeatMix = { extraSeats: number; seatPacks: number };

export function seatCapacity(extraSeats: number, seatPacks: number) {
  return INCLUDED_PEOPLE + extraSeats + seatPacks * PACK_SIZE;
}

export function periodSuffix(period: BillingPeriod) {
  return period === "quarter" ? "trimestre" : "mês";
}

export function formatUsd(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function seatCharge(period: BillingPeriod, mix: SeatMix) {
  const prices = SEAT_PRICES[period];
  return mix.extraSeats * prices.single + mix.seatPacks * prices.pack;
}

export function planTotal(period: BillingPeriod, mix: SeatMix, baseCents?: number) {
  return (baseCents ?? SEAT_PRICES[period].base) + seatCharge(period, mix);
}

export function mixFits(people: number, mix: SeatMix) {
  const capacity = seatCapacity(mix.extraSeats, mix.seatPacks);
  return (
    Number.isInteger(mix.extraSeats) &&
    Number.isInteger(mix.seatPacks) &&
    mix.extraSeats >= 0 &&
    mix.seatPacks >= 0 &&
    capacity >= people &&
    capacity <= MAX_PEOPLE
  );
}

export function cheapestSeats(people: number, period: BillingPeriod = "month"): SeatMix {
  if (!Number.isInteger(people) || people < 1) {
    throw new Error("Quantidade de pessoas inválida.");
  }
  if (people > MAX_PEOPLE) {
    throw new Error("O plano aceita no máximo 15 pessoas.");
  }
  if (people <= INCLUDED_PEOPLE) return { extraSeats: 0, seatPacks: 0 };
  const need = people - INCLUDED_PEOPLE;
  let best: { mix: SeatMix; cost: number } | null = null;
  for (let seatPacks = 0; seatPacks <= 2; seatPacks += 1) {
    const extraSeats = Math.max(0, need - seatPacks * PACK_SIZE);
    const mix = { extraSeats, seatPacks };
    if (!mixFits(people, mix)) continue;
    const cost = seatCharge(period, mix);
    if (!best || cost < best.cost || (cost === best.cost && seatPacks > best.mix.seatPacks)) {
      best = { mix, cost };
    }
  }
  if (!best) throw new Error("O plano aceita no máximo 15 pessoas.");
  return best.mix;
}

export function seatsFromAddons(
  addons: Array<{ addon_id: string; quantity: number }>,
  ids: { singles: string[]; packs: string[] },
): SeatMix {
  let extraSeats = 0;
  let seatPacks = 0;
  for (const addon of addons) {
    if (!Number.isInteger(addon.quantity) || addon.quantity <= 0) continue;
    if (ids.singles.includes(addon.addon_id)) extraSeats += addon.quantity;
    if (ids.packs.includes(addon.addon_id)) seatPacks += addon.quantity;
  }
  return { extraSeats, seatPacks };
}

export type SeatQuote = {
  people: number;
  capacity: number;
  target: number;
  needsPurchase: boolean;
  blocked: boolean;
  message: string;
  suggestion: (SeatMix & { totalLabel: string; detail: string }) | null;
};

function mixDetail(mix: SeatMix) {
  const parts: string[] = [];
  if (mix.seatPacks > 0) {
    parts.push(mix.seatPacks === 1 ? "1 combo +5" : `${mix.seatPacks} combos +5`);
  }
  if (mix.extraSeats > 0) {
    parts.push(mix.extraSeats === 1 ? "1 pessoa avulsa" : `${mix.extraSeats} pessoas avulsas`);
  }
  if (parts.length === 0) return "só as 5 pessoas incluídas";
  return parts.join(" e ");
}

export function describeSeatQuote(input: {
  people: number;
  alreadyCounted: boolean;
  period: BillingPeriod;
  mix: SeatMix;
  baseCents?: number;
  enforce?: boolean;
}): SeatQuote {
  const capacity = seatCapacity(input.mix.extraSeats, input.mix.seatPacks);
  const target = input.alreadyCounted ? input.people : input.people + 1;
  const blocked = target > MAX_PEOPLE;
  const needsPurchase = input.enforce !== false && !blocked && target > capacity;
  const suggestion = needsPurchase ? cheapestSeats(target, input.period) : null;
  const totalLabel = suggestion
    ? `${formatUsd(planTotal(input.period, suggestion, input.baseCents))}/${periodSuffix(input.period)}`
    : "";
  let message = "";
  if (blocked) {
    message = "O plano aceita no máximo 15 pessoas nesta conta. Não há vaga acima disso.";
  } else if (needsPurchase && suggestion) {
    message = `Esta pessoa passa da capacidade (${input.people} de ${capacity}). A opção mais barata para ${target} pessoas é ${mixDetail(suggestion)}, total ${totalLabel}. A vaga só entra depois que o Dodo confirmar o pagamento.`;
  }
  return {
    people: input.people,
    capacity,
    target,
    needsPurchase,
    blocked,
    message,
    suggestion: suggestion ? { ...suggestion, totalLabel, detail: mixDetail(suggestion) } : null,
  };
}
