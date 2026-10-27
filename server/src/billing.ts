import DodoPayments, { APIError } from "dodopayments";
import { Prisma, type BillingPeriod, type BillingStatus } from "@prisma/client";
import { uid } from "./crypto";
import { prisma } from "./db";
import { ApiError } from "./errors";
import {
  INCLUDED_PEOPLE,
  MAX_PEOPLE,
  PACK_SIZE,
  SEAT_PRICES,
  describeSeatQuote,
  formatUsd,
  mixFits,
  periodSuffix,
  planTotal,
  seatCapacity,
  seatsFromAddons,
  type SeatMix,
  type SeatQuote,
} from "./seats";

const BILLING_STATUSES = new Set<BillingStatus>([
  "pending",
  "active",
  "past_due",
  "on_hold",
  "paused",
  "cancelled",
  "failed",
  "expired",
]);
const ZERO_DECIMAL = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);
const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

const STATUS_LABEL: Record<BillingStatus, string> = {
  pending: "Aguardando pagamento",
  active: "Ativa",
  past_due: "Pagamento em atraso",
  on_hold: "Pagamento falhou",
  paused: "Pausada",
  cancelled: "Cancelada",
  failed: "Falhou",
  expired: "Encerrada",
};

type BillingActor = {
  id: string;
  name: string;
  email: string;
  workspaceId: string | null;
  access: string;
  owner: boolean;
};

type Metadata = { [key: string]: string | number | boolean };

type SubscriptionPayload = {
  subscription_id: string;
  product_id: string;
  status: string;
  cancel_at_next_billing_date: boolean;
  next_billing_date: string;
  metadata?: Metadata;
  customer: { customer_id: string };
  addons?: Array<{ addon_id: string; quantity: number }>;
};

type PaymentPayload = {
  metadata?: Metadata;
  customer: { customer_id: string };
  subscription_ids: string[];
  checkout_session_id?: string | null;
};

type WebhookEvent = ReturnType<DodoPayments["webhooks"]["unwrap"]>;

export type BillingAction = "checkout" | "portal" | "none";

export type SeatSnapshot = {
  people: number;
  capacity: number;
  included: number;
  max: number;
  extraSeats: number;
  seatPacks: number;
  period: BillingPeriod;
  periodLabel: string;
  totalLabel: string;
  singlePriceLabel: string;
  packPriceLabel: string;
  usageLabel: string;
  canAddSingle: boolean;
  canAddPack: boolean;
  canRemoveSingle: boolean;
  canRemovePack: boolean;
  canSwitchPeriod: boolean;
  purchasable: boolean;
};

export type BillingSnapshot = {
  active: boolean;
  configured: boolean;
  status: BillingStatus | null;
  statusLabel: string;
  action: BillingAction;
  priceLabel: string | null;
  productName: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  seats: SeatSnapshot | null;
};

type PlanInfo = {
  name: string | null;
  priceLabel: string | null;
  amount: number | null;
  currency: string | null;
};

class RetryableWebhookError extends Error {}

let planCache: { at: number; plan: PlanInfo } | null = null;

export function dodoEnvironment(): "live_mode" | "test_mode" {
  return process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode";
}

export function paymentsConfigured() {
  return Boolean(
    process.env.DODO_PAYMENTS_API_KEY?.trim() &&
      process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim() &&
      process.env.DODO_PAYMENTS_PRODUCT_ID?.trim(),
  );
}

export function metadataString(metadata: Metadata | null | undefined, key: string) {
  const value = metadata?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function statusGrantsAccess(status: string | null | undefined) {
  return status === "active" || status === "past_due";
}

export function subscriptionGrantsAccess(
  row: { status: string; productId: string | null },
  expectedProductId: string | Array<string | null | undefined> | null | undefined,
) {
  if (!statusGrantsAccess(row.status)) return false;
  const expected = (Array.isArray(expectedProductId) ? expectedProductId : [expectedProductId])
    .map((id) => id?.trim())
    .filter((id): id is string => Boolean(id));
  if (!expected.length || !row.productId) return false;
  return expected.includes(row.productId);
}

export function isQuarterlyPlan(price: {
  type: string;
  payment_frequency_interval?: string;
  payment_frequency_count?: number;
}) {
  return (
    price.type === "recurring_price" &&
    price.payment_frequency_interval === "Month" &&
    price.payment_frequency_count === 3
  );
}

function configuredProductIds() {
  return [process.env.DODO_PAYMENTS_PRODUCT_ID, process.env.DODO_PAYMENTS_PRODUCT_ID_QUARTER];
}

function addonCatalog() {
  const monthSeat = process.env.DODO_PAYMENTS_ADDON_SEAT_MONTH?.trim() || "";
  const quarterSeat = process.env.DODO_PAYMENTS_ADDON_SEAT_QUARTER?.trim() || "";
  const monthPack = process.env.DODO_PAYMENTS_ADDON_PACK_MONTH?.trim() || "";
  const quarterPack = process.env.DODO_PAYMENTS_ADDON_PACK_QUARTER?.trim() || "";
  return {
    monthSeat,
    quarterSeat,
    monthPack,
    quarterPack,
    singles: [monthSeat, quarterSeat].filter(Boolean),
    packs: [monthPack, quarterPack].filter(Boolean),
  };
}

function periodForProduct(productId: string | null | undefined): BillingPeriod {
  const quarter = process.env.DODO_PAYMENTS_PRODUCT_ID_QUARTER?.trim();
  if (quarter && productId === quarter) return "quarter";
  return "month";
}

export function isMonthlyPlan(price: {
  type: string;
  payment_frequency_interval?: string;
  payment_frequency_count?: number;
}) {
  return (
    price.type === "recurring_price" &&
    price.payment_frequency_interval === "Month" &&
    price.payment_frequency_count === 1
  );
}

export function formatMinorAmount(amount: number, currency: string) {
  const code = currency.toUpperCase();
  const digits = ZERO_DECIMAL.has(code) ? 0 : THREE_DECIMAL.has(code) ? 3 : 2;
  const major = amount / 10 ** digits;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: code }).format(major);
}

export function shouldApplyEvent(stored: Date | null, incoming: Date) {
  if (!stored) return true;
  return incoming.getTime() >= stored.getTime();
}

function productId() {
  const id = process.env.DODO_PAYMENTS_PRODUCT_ID?.trim();
  if (!id) throw new ApiError(503, "Pagamentos ainda não estão configurados.");
  return id;
}

function appOrigin() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function returnUrl() {
  const configured = process.env.DODO_PAYMENTS_RETURN_URL?.trim();
  if (configured) return configured;
  return `${appOrigin()}/configuracoes?tab=assinatura`;
}

function dodoClient() {
  const bearerToken = process.env.DODO_PAYMENTS_API_KEY?.trim();
  if (!bearerToken) throw new ApiError(503, "Pagamentos ainda não estão configurados.");
  return new DodoPayments({
    bearerToken,
    environment: dodoEnvironment(),
    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY,
  });
}

function asStatus(value: string): BillingStatus {
  if (!BILLING_STATUSES.has(value as BillingStatus)) {
    throw new RetryableWebhookError(`Status de assinatura desconhecido: ${value}`);
  }
  return value as BillingStatus;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function userBypassesBilling(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { master: true },
  });
  return user?.master === true;
}

function assertBillingAdmin(actor: BillingActor) {
  if (!actor.workspaceId) {
    throw new ApiError(403, "Escolha um espaço de trabalho.");
  }
  if (actor.access !== "admin") {
    throw new ApiError(403, "Só um administrador pode gerenciar a assinatura.");
  }
}

async function describePlan(): Promise<PlanInfo> {
  const empty = { name: null, priceLabel: null, amount: null, currency: null };
  if (!paymentsConfigured()) return empty;
  if (planCache && Date.now() - planCache.at < 10 * 60 * 1000) return planCache.plan;
  try {
    const product = await dodoClient().products.retrieve(productId());
    const price = product.price;
    const priced = price.type === "recurring_price" || price.type === "one_time_price";
    const plan: PlanInfo = {
      name: product.name?.trim() || "Plano mensal",
      priceLabel: priced
        ? `${formatMinorAmount(price.price, price.currency)}${isMonthlyPlan(price) ? "/mês" : isQuarterlyPlan(price) ? "/trimestre" : ""}`
        : null,
      amount: priced ? price.price : null,
      currency: priced ? price.currency : null,
    };
    planCache = { at: Date.now(), plan };
    return plan;
  } catch (error) {
    console.error("[dodo] não foi possível ler o plano", error);
    return empty;
  }
}

function billingAction(
  canManage: boolean,
  row: { status: BillingStatus; dodoCustomerId: string | null; dodoSubscriptionId: string | null } | null,
): BillingAction {
  if (!canManage) return "none";
  if (!row || row.status === "cancelled" || row.status === "expired" || row.status === "failed") {
    return "checkout";
  }
  if (row.status === "pending" && !row.dodoSubscriptionId) return "checkout";
  if (row.dodoCustomerId) return "portal";
  return "checkout";
}

export async function billingSnapshot(actor: BillingActor): Promise<BillingSnapshot> {
  const configured = paymentsConfigured();
  const plan = await describePlan();
  const empty: BillingSnapshot = {
    active: false,
    configured,
    status: null,
    statusLabel: "Sem assinatura",
    action: actor.workspaceId && actor.access === "admin" ? "checkout" : "none",
    priceLabel: plan.priceLabel,
    productName: plan.name,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    seats: null,
  };
  if (!actor.workspaceId) return empty;
  const [bypass, row] = await Promise.all([
    userBypassesBilling(actor.id),
    prisma.workspaceSubscription.findUnique({ where: { workspaceId: actor.workspaceId } }),
  ]);
  const entitled = row ? subscriptionGrantsAccess(row, configuredProductIds()) : false;
  const seats = await seatSnapshot(actor.workspaceId, row);
  if (!row) {
    return { ...empty, active: bypass, seats };
  }
  return {
    active: bypass || entitled,
    configured,
    status: row.status,
    statusLabel: STATUS_LABEL[row.status],
    action: billingAction(actor.access === "admin", row),
    priceLabel: plan.priceLabel,
    productName: plan.name,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    seats,
  };
}

export async function workspaceIsEntitled(workspaceId: string) {
  const row = await prisma.workspaceSubscription.findUnique({ where: { workspaceId } });
  if (!row) return false;
  return subscriptionGrantsAccess(row, configuredProductIds());
}

export async function assertWorkspaceEntitled(actor: BillingActor) {
  if (!actor.workspaceId) return;
  if (await userBypassesBilling(actor.id)) return;
  if (await workspaceIsEntitled(actor.workspaceId)) return;
  throw new ApiError(402, "Assine o plano mensal para usar o ASA.");
}

async function assertMonthlyProduct(client: DodoPayments, id: string) {
  const product = await client.products.retrieve(id);
  if (!isMonthlyPlan(product.price)) {
    throw new ApiError(503, "O produto configurado não é um plano mensal.");
  }
  return product;
}

export async function createCheckout(actor: BillingActor) {
  assertBillingAdmin(actor);
  const workspaceId = actor.workspaceId;
  if (!workspaceId) throw new ApiError(403, "Escolha um espaço de trabalho.");
  const row = await prisma.workspaceSubscription.findUnique({ where: { workspaceId } });
  if (row && subscriptionGrantsAccess(row, configuredProductIds())) {
    throw new ApiError(409, "Este espaço já tem uma assinatura ativa.");
  }
  if (row?.dodoCustomerId && row.dodoSubscriptionId && billingAction(true, row) === "portal") {
    return createPortal(actor);
  }
  const client = dodoClient();
  const id = productId();
  await assertMonthlyProduct(client, id);
  let session;
  try {
    session = await client.checkoutSessions.create({
      product_cart: [{ product_id: id, quantity: 1 }],
      customer: row?.dodoCustomerId
        ? { customer_id: row.dodoCustomerId }
        : { email: actor.email, name: actor.name },
      metadata: {
        user_id: actor.id,
        workspace_id: workspaceId,
      },
      feature_flags: { allow_customer_editing_email: false },
      customization: { force_language: "pt" },
      return_url: returnUrl(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      console.error("[dodo] checkout", error.status, error.message);
      throw new ApiError(502, "Não foi possível abrir o checkout.");
    }
    throw error;
  }
  if (!session.checkout_url) {
    throw new ApiError(502, "Não foi possível abrir o checkout.");
  }
  await prisma.billingCheckout.create({
    data: {
      id: uid("chk"),
      sessionId: session.session_id,
      workspaceId,
      userId: actor.id,
    },
  });
  return { url: session.checkout_url };
}

export async function createPortal(actor: BillingActor) {
  assertBillingAdmin(actor);
  const workspaceId = actor.workspaceId;
  if (!workspaceId) throw new ApiError(403, "Escolha um espaço de trabalho.");
  const row = await prisma.workspaceSubscription.findUnique({ where: { workspaceId } });
  if (!row?.dodoCustomerId) {
    throw new ApiError(400, "Nenhuma assinatura para gerenciar.");
  }
  try {
    const session = await dodoClient().customers.customerPortal.create(row.dodoCustomerId, {
      return_url: `${appOrigin()}/configuracoes?tab=assinatura`,
    });
    return { url: session.link };
  } catch (error) {
    if (error instanceof APIError) {
      console.error("[dodo] portal", error.status, error.message);
      throw new ApiError(502, "Não foi possível abrir o portal de pagamento.");
    }
    throw error;
  }
}

type SeatDb = Prisma.TransactionClient | typeof prisma;

async function accountWorkspaceIds(db: SeatDb, workspaceId: string) {
  const owners = await db.workspaceMember.findMany({
    where: { workspaceId, owner: true, status: "active" },
    select: { userId: true },
  });
  const ownerIds = owners.map((item) => item.userId);
  if (ownerIds.length === 0) return [workspaceId];
  const owned = await db.workspaceMember.findMany({
    where: { userId: { in: ownerIds }, owner: true, status: "active" },
    select: { workspaceId: true },
  });
  const ids = [...new Set(owned.map((item) => item.workspaceId))];
  return ids.length > 0 ? ids : [workspaceId];
}

async function countAccountPeople(db: SeatDb, workspaceIds: string[], email?: string) {
  const members = await db.workspaceMember.findMany({
    where: { workspaceId: { in: workspaceIds }, status: { in: ["pending", "active"] } },
    select: { userId: true, user: { select: { email: true } } },
  });
  const people = new Set(members.map((item) => item.userId)).size;
  const alreadyCounted = email
    ? members.some((item) => item.user.email.toLowerCase() === email.trim().toLowerCase())
    : false;
  return { people, alreadyCounted };
}

function seatView(
  people: number,
  mix: SeatMix,
  period: BillingPeriod,
  purchasable: boolean,
  baseCents: number,
): SeatSnapshot {
  const capacity = seatCapacity(mix.extraSeats, mix.seatPacks);
  const prices = SEAT_PRICES[period];
  const suffix = periodSuffix(period);
  return {
    people,
    capacity,
    included: INCLUDED_PEOPLE,
    max: MAX_PEOPLE,
    extraSeats: mix.extraSeats,
    seatPacks: mix.seatPacks,
    period,
    periodLabel: period === "quarter" ? "Trimestral" : "Mensal",
    totalLabel: `${formatUsd(planTotal(period, mix, baseCents))}/${suffix}`,
    singlePriceLabel: `${formatUsd(prices.single)}/${suffix}`,
    packPriceLabel: `${formatUsd(prices.pack)}/${suffix}`,
    usageLabel: `${people} de ${capacity} pessoas`,
    canAddSingle: purchasable && capacity + 1 <= MAX_PEOPLE,
    canAddPack: purchasable && capacity + PACK_SIZE <= MAX_PEOPLE,
    canRemoveSingle: purchasable && mix.extraSeats > 0 && capacity - 1 >= people,
    canRemovePack: purchasable && mix.seatPacks > 0 && capacity - PACK_SIZE >= people,
    canSwitchPeriod: purchasable && Boolean(process.env.DODO_PAYMENTS_PRODUCT_ID_QUARTER?.trim()),
    purchasable,
  };
}

async function seatSnapshot(
  workspaceId: string,
  row: { extraSeats: number; seatPacks: number; billingPeriod: BillingPeriod; status: BillingStatus; dodoSubscriptionId: string | null } | null,
): Promise<SeatSnapshot> {
  const workspaceIds = await accountWorkspaceIds(prisma, workspaceId);
  const { people } = await countAccountPeople(prisma, workspaceIds);
  const mix = { extraSeats: row?.extraSeats ?? 0, seatPacks: row?.seatPacks ?? 0 };
  const period = row?.billingPeriod ?? "month";
  const catalog = addonCatalog();
  const addonReady =
    period === "quarter"
      ? Boolean(catalog.quarterSeat && catalog.quarterPack)
      : Boolean(catalog.monthSeat && catalog.monthPack);
  const purchasable = Boolean(row?.dodoSubscriptionId && statusGrantsAccess(row.status) && addonReady);
  return seatView(people, mix, period, purchasable, SEAT_PRICES[period].base);
}

function addonSelection(period: BillingPeriod, mix: SeatMix) {
  const catalog = addonCatalog();
  const seat = period === "quarter" ? catalog.quarterSeat : catalog.monthSeat;
  const pack = period === "quarter" ? catalog.quarterPack : catalog.monthPack;
  if (!seat || !pack) {
    throw new ApiError(503, "As vagas extras ainda não estão configuradas.");
  }
  const addons = [
    ...(mix.extraSeats > 0 ? [{ addon_id: seat, quantity: mix.extraSeats }] : []),
    ...(mix.seatPacks > 0 ? [{ addon_id: pack, quantity: mix.seatPacks }] : []),
  ];
  return addons;
}

async function pushSeatChange(
  subscriptionId: string,
  productId: string,
  period: BillingPeriod,
  mix: SeatMix,
) {
  try {
    const result = await dodoClient().subscriptions.changePlan(subscriptionId, {
      product_id: productId,
      quantity: 1,
      proration_billing_mode: "prorated_immediately",
      on_payment_failure: "prevent_change",
      addons: addonSelection(period, mix),
    });
    return { url: result.payment_link ?? null };
  } catch (error) {
    if (error instanceof APIError) {
      console.error("[dodo] vagas", error.status, error.message);
      throw new ApiError(502, "Não foi possível atualizar as vagas no Dodo.");
    }
    throw error;
  }
}

async function requireSeatSubscription(actor: BillingActor) {
  assertBillingAdmin(actor);
  const workspaceId = actor.workspaceId;
  if (!workspaceId) throw new ApiError(403, "Escolha um espaço de trabalho.");
  const row = await prisma.workspaceSubscription.findUnique({ where: { workspaceId } });
  if (!row?.dodoSubscriptionId || !row.productId || !statusGrantsAccess(row.status)) {
    throw new ApiError(409, "Assine o plano antes de comprar vagas.");
  }
  if (!subscriptionGrantsAccess(row, configuredProductIds())) {
    throw new ApiError(409, "Assine o plano antes de comprar vagas.");
  }
  return row;
}

export async function quoteSeats(actor: BillingActor, email: string): Promise<SeatQuote> {
  assertBillingAdmin(actor);
  const workspaceId = actor.workspaceId;
  if (!workspaceId) throw new ApiError(403, "Escolha um espaço de trabalho.");
  const row = await prisma.workspaceSubscription.findUnique({ where: { workspaceId } });
  const workspaceIds = await accountWorkspaceIds(prisma, workspaceId);
  const counted = await countAccountPeople(prisma, workspaceIds, email);
  const entitled = Boolean(row && subscriptionGrantsAccess(row, configuredProductIds()));
  return describeSeatQuote({
    people: counted.people,
    alreadyCounted: counted.alreadyCounted,
    period: row?.billingPeriod ?? "month",
    mix: { extraSeats: row?.extraSeats ?? 0, seatPacks: row?.seatPacks ?? 0 },
    enforce: entitled,
  });
}

export async function assertCanAddPerson(
  db: SeatDb,
  workspaceId: string,
  email: string,
) {
  const row = await db.workspaceSubscription.findUnique({ where: { workspaceId } });
  const entitled = Boolean(row && subscriptionGrantsAccess(row, configuredProductIds()));
  const workspaceIds = await accountWorkspaceIds(db, workspaceId);
  const counted = await countAccountPeople(db, workspaceIds, email);
  const quote = describeSeatQuote({
    people: counted.people,
    alreadyCounted: counted.alreadyCounted,
    period: row?.billingPeriod ?? "month",
    mix: { extraSeats: row?.extraSeats ?? 0, seatPacks: row?.seatPacks ?? 0 },
    enforce: entitled,
  });
  if (quote.blocked || quote.needsPurchase) {
    throw new ApiError(409, quote.message);
  }
}

export async function changeSeats(actor: BillingActor, mix: SeatMix) {
  const row = await requireSeatSubscription(actor);
  const workspaceIds = await accountWorkspaceIds(prisma, row.workspaceId);
  const { people } = await countAccountPeople(prisma, workspaceIds);
  if (!mixFits(people, mix)) {
    const capacity = seatCapacity(mix.extraSeats, mix.seatPacks);
    if (capacity > MAX_PEOPLE) {
      throw new ApiError(409, "O plano aceita no máximo 15 pessoas nesta conta.");
    }
    throw new ApiError(409, "Essa capacidade fica abaixo das pessoas que já estão na conta.");
  }
  const same = mix.extraSeats === row.extraSeats && mix.seatPacks === row.seatPacks;
  if (same) return { url: null };
  return pushSeatChange(row.dodoSubscriptionId!, row.productId!, row.billingPeriod, mix);
}

export async function changeBillingPeriod(actor: BillingActor, period: BillingPeriod) {
  const row = await requireSeatSubscription(actor);
  if (period === row.billingPeriod) return { url: null };
  const productId =
    period === "quarter"
      ? process.env.DODO_PAYMENTS_PRODUCT_ID_QUARTER?.trim()
      : process.env.DODO_PAYMENTS_PRODUCT_ID?.trim();
  if (!productId) throw new ApiError(503, "O período trimestral ainda não está configurado.");
  const client = dodoClient();
  const product = await client.products.retrieve(productId);
  if (period === "quarter" ? !isQuarterlyPlan(product.price) : !isMonthlyPlan(product.price)) {
    throw new ApiError(503, "O produto desse período não está com a cobrança certa.");
  }
  return pushSeatChange(row.dodoSubscriptionId!, productId, period, {
    extraSeats: row.extraSeats,
    seatPacks: row.seatPacks,
  });
}

async function payerOrNull(tx: Prisma.TransactionClient, userId: string | null) {
  if (!userId) return null;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
  return user?.id ?? null;
}

async function resolveWorkspaceId(tx: Prisma.TransactionClient, data: SubscriptionPayload) {
  const linked = await tx.workspaceSubscription.findUnique({
    where: { dodoSubscriptionId: data.subscription_id },
    select: { workspaceId: true },
  });
  if (linked) return linked.workspaceId;

  const fromMetadata = metadataString(data.metadata, "workspace_id");
  if (fromMetadata) {
    const workspace = await tx.workspace.findUnique({
      where: { id: fromMetadata },
      select: { id: true },
    });
    if (!workspace) return null;
    return workspace.id;
  }

  const byCustomer = await tx.workspaceSubscription.findMany({
    where: { dodoCustomerId: data.customer.customer_id },
    select: { workspaceId: true },
  });
  if (byCustomer.length === 1) return byCustomer[0].workspaceId;
  throw new RetryableWebhookError("Assinatura ainda sem espaço de trabalho.");
}

async function applySubscription(
  tx: Prisma.TransactionClient,
  data: SubscriptionPayload,
  at: Date,
) {
  const workspaceId = await resolveWorkspaceId(tx, data);
  if (!workspaceId) {
    console.error("[dodo] assinatura sem espaço correspondente", data.subscription_id);
    return;
  }
  const existing = await tx.workspaceSubscription.findUnique({ where: { workspaceId } });
  if (existing && !shouldApplyEvent(existing.sourceUpdatedAt, at)) return;
  const payerUserId = await payerOrNull(tx, metadataString(data.metadata, "user_id"));
  const period = periodForProduct(data.product_id);
  const catalog = addonCatalog();
  const seatPatch =
    data.addons && (catalog.singles.length > 0 || catalog.packs.length > 0)
      ? seatsFromAddons(data.addons, catalog)
      : null;
  if (seatPatch && seatCapacity(seatPatch.extraSeats, seatPatch.seatPacks) > MAX_PEOPLE) {
    console.error("[dodo] vagas acima de 15 ignoradas", data.subscription_id);
  }
  const seats =
    seatPatch && seatCapacity(seatPatch.extraSeats, seatPatch.seatPacks) <= MAX_PEOPLE ? seatPatch : null;
  const next = {
    payerUserId: payerUserId ?? existing?.payerUserId ?? null,
    dodoCustomerId: data.customer.customer_id,
    dodoSubscriptionId: data.subscription_id,
    productId: data.product_id,
    status: asStatus(data.status),
    billingPeriod: period,
    ...(seats ? { extraSeats: seats.extraSeats, seatPacks: seats.seatPacks } : {}),
    cancelAtPeriodEnd: data.cancel_at_next_billing_date,
    currentPeriodEnd: parseDate(data.next_billing_date),
    sourceUpdatedAt: at,
  };
  await tx.workspaceSubscription.upsert({
    where: { workspaceId },
    create: { workspaceId, ...next },
    update: next,
  });
}

async function linkPayment(tx: Prisma.TransactionClient, payment: PaymentPayload) {
  if (payment.subscription_ids.length !== 1) return;
  const subscriptionId = payment.subscription_ids[0];
  if (!subscriptionId) return;
  let workspaceId = metadataString(payment.metadata, "workspace_id");
  if (!workspaceId && payment.checkout_session_id) {
    const checkout = await tx.billingCheckout.findUnique({
      where: { sessionId: payment.checkout_session_id },
      select: { workspaceId: true },
    });
    workspaceId = checkout?.workspaceId ?? null;
  }
  if (!workspaceId) return;
  const workspace = await tx.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  if (!workspace) return;
  const owned = await tx.workspaceSubscription.findUnique({
    where: { dodoSubscriptionId: subscriptionId },
    select: { workspaceId: true },
  });
  if (owned && owned.workspaceId !== workspaceId) return;
  const existing = await tx.workspaceSubscription.findUnique({ where: { workspaceId } });
  if (
    existing?.dodoSubscriptionId &&
    existing.dodoSubscriptionId !== subscriptionId &&
    statusGrantsAccess(existing.status)
  ) {
    return;
  }
  const payerUserId = await payerOrNull(tx, metadataString(payment.metadata, "user_id"));
  await tx.workspaceSubscription.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      payerUserId,
      dodoCustomerId: payment.customer.customer_id,
      dodoSubscriptionId: subscriptionId,
      status: "pending",
    },
    update: {
      dodoCustomerId: payment.customer.customer_id,
      dodoSubscriptionId: existing?.dodoSubscriptionId ?? subscriptionId,
      payerUserId: existing?.payerUserId ?? payerUserId,
    },
  });
}

function subscriptionPayload(event: WebhookEvent): SubscriptionPayload | null {
  if (!event.type.startsWith("subscription.")) return null;
  return event.data as SubscriptionPayload;
}

export async function handleDodoWebhook(
  rawBody: string,
  headers: { id: string; signature: string; timestamp: string },
) {
  if (!headers.id) throw new ApiError(400, "Missing webhook-id");
  let event: WebhookEvent;
  try {
    event = dodoClient().webhooks.unwrap(rawBody, {
      headers: {
        "webhook-id": headers.id,
        "webhook-signature": headers.signature,
        "webhook-timestamp": headers.timestamp,
      },
    });
  } catch (error) {
    console.error("[dodo] assinatura do webhook rejeitada", error);
    throw new ApiError(401, "Invalid signature");
  }

  const subscription = subscriptionPayload(event);
  if (subscription?.subscription_id) {
    try {
      const remote = await dodoClient().subscriptions.retrieve(subscription.subscription_id);
      subscription.addons = remote.addons;
      subscription.product_id = remote.product_id;
      subscription.status = remote.status;
      subscription.cancel_at_next_billing_date = remote.cancel_at_next_billing_date;
      subscription.next_billing_date = remote.next_billing_date;
    } catch (error) {
      console.error("[dodo] não foi possível ler a assinatura do webhook", error);
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.webhookDelivery.createMany({
        data: [{ id: headers.id, type: event.type }],
        skipDuplicates: true,
      });
      if (claim.count === 0) return;
      if (subscription) {
        await applySubscription(tx, subscription, eventTime(event.timestamp));
        return;
      }
      if (event.type === "payment.succeeded") {
        await linkPayment(tx, event.data);
      }
    });
  } catch (error) {
    console.error("[dodo] falha ao gravar webhook", event.type, error);
    throw new ApiError(503, "Webhook persistence failed");
  }
}
