import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatMinorAmount,
  isMonthlyPlan,
  metadataString,
  shouldApplyEvent,
  statusGrantsAccess,
  subscriptionGrantsAccess,
} from "./billing";

test("só assinatura ativa ou em carência libera o app", () => {
  assert.equal(statusGrantsAccess("active"), true);
  assert.equal(statusGrantsAccess("past_due"), true);
  for (const status of ["pending", "on_hold", "paused", "cancelled", "failed", "expired", null]) {
    assert.equal(statusGrantsAccess(status), false);
  }
});

test("o plano configurado precisa ser o produto da assinatura", () => {
  assert.equal(
    subscriptionGrantsAccess({ status: "active", productId: "pdt_mensal" }, "pdt_mensal"),
    true,
  );
  assert.equal(
    subscriptionGrantsAccess({ status: "active", productId: "pdt_outro" }, "pdt_mensal"),
    false,
  );
  assert.equal(
    subscriptionGrantsAccess({ status: "on_hold", productId: "pdt_mensal" }, "pdt_mensal"),
    false,
  );
  assert.equal(subscriptionGrantsAccess({ status: "active", productId: "pdt_mensal" }, ""), false);
});

test("plano mensal é recorrência de um mês", () => {
  assert.equal(
    isMonthlyPlan({
      type: "recurring_price",
      payment_frequency_interval: "Month",
      payment_frequency_count: 1,
    }),
    true,
  );
  assert.equal(
    isMonthlyPlan({
      type: "recurring_price",
      payment_frequency_interval: "Year",
      payment_frequency_count: 1,
    }),
    false,
  );
  assert.equal(isMonthlyPlan({ type: "one_time_price" }), false);
});

test("metadata só aceita texto do workspace", () => {
  assert.equal(metadataString({ workspace_id: " ws_1 " }, "workspace_id"), "ws_1");
  assert.equal(metadataString({ workspace_id: 1 }, "workspace_id"), null);
  assert.equal(metadataString(undefined, "workspace_id"), null);
});

test("evento antigo não sobrescreve o estado mais novo", () => {
  const older = new Date("2026-10-01T00:00:00Z");
  const newer = new Date("2026-10-02T00:00:00Z");
  assert.equal(shouldApplyEvent(null, older), true);
  assert.equal(shouldApplyEvent(older, newer), true);
  assert.equal(shouldApplyEvent(newer, older), false);
  assert.equal(shouldApplyEvent(newer, newer), true);
});

test("valor em centavos vira moeda", () => {
  const brl = formatMinorAmount(4900, "BRL");
  assert.match(brl, /49/);
  assert.doesNotMatch(brl, /4\.900/);
  const jpy = formatMinorAmount(4900, "JPY");
  assert.match(jpy, /4[.\s]?900|4900/);
  assert.doesNotMatch(jpy, /49,00/);
});
