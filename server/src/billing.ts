import DodoPayments, { APIError } from "dodopayments";
import { Prisma, type BillingStatus } from "@prisma/client";
import { uid } from "./crypto";
import { prisma } from "./db";
import { ApiError } from "./errors";

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
};

type PaymentPayload = {
  metadata?: Metadata;
  customer: { customer_id: string };
  subscription_ids: string[];
  checkout_session_id?: string | null;
};

type WebhookEvent = ReturnType<DodoPayments["webhooks"]["unwrap"]>;

export type BillingAction = "checkout" | "portal" | "none";

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
};

type PlanInfo = { name: string | null; priceLabel: string | null };

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
  expectedProductId: string | null | undefined,
) {
  if (!statusGrantsAccess(row.status)) return false;
  const expected = expectedProductId?.trim();
  if (!expected) return false;
  return row.productId === expected;
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
  if (!paymentsConfigured()) return { name: null, priceLabel: null };
  if (planCache && Date.now() - planCache.at < 10 * 60 * 1000) return planCache.plan;
  try {
    const product = await dodoClient().products.retrieve(productId());
    const price = product.price;
    const plan: PlanInfo = {
      name: product.name?.trim() || "Plano mensal",
      priceLabel:
        price.type === "recurring_price" || price.type === "one_time_price"
          ? `${formatMinorAmount(price.price, price.currency)}${isMonthlyPlan(price) ? "/mês" : ""}`
          : null,
    };
    planCache = { at: Date.now(), plan };
    return plan;
  } catch (error) {
    console.error("[dodo] não foi possível ler o plano", error);
    return { name: null, priceLabel: null };
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
  };
  if (!actor.workspaceId) return empty;
  const [bypass, row] = await Promise.all([
    userBypassesBilling(actor.id),
    prisma.workspaceSubscription.findUnique({ where: { workspaceId: actor.workspaceId } }),
  ]);
  const entitled = row
    ? subscriptionGrantsAccess(row, process.env.DODO_PAYMENTS_PRODUCT_ID)
    : false;
  if (!row) {
    return { ...empty, active: bypass };
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
  };
}

export async function workspaceIsEntitled(workspaceId: string) {
  const row = await prisma.workspaceSubscription.findUnique({ where: { workspaceId } });
  if (!row) return false;
  return subscriptionGrantsAccess(row, process.env.DODO_PAYMENTS_PRODUCT_ID);
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
  if (row && subscriptionGrantsAccess(row, process.env.DODO_PAYMENTS_PRODUCT_ID)) {
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
  if (!workspaceId) return;
  const existing = await tx.workspaceSubscription.findUnique({ where: { workspaceId } });
  if (existing && !shouldApplyEvent(existing.sourceUpdatedAt, at)) return;
  const payerUserId = await payerOrNull(tx, metadataString(data.metadata, "user_id"));
  const next = {
    payerUserId: payerUserId ?? existing?.payerUserId ?? null,
    dodoCustomerId: data.customer.customer_id,
    dodoSubscriptionId: data.subscription_id,
    productId: data.product_id,
    status: asStatus(data.status),
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

  try {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.webhookDelivery.createMany({
        data: [{ id: headers.id, type: event.type }],
        skipDuplicates: true,
      });
      if (claim.count === 0) return;
      const subscription = subscriptionPayload(event);
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
