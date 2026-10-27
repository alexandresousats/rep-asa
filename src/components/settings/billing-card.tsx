"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { loadSession, openBillingPortal, refreshBilling, startCheckout, updateBillingPeriod, updateSeats } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useWorkspace } from "@/lib/workspace";

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(date);
}

export function BillingSettings() {
  const searchParams = useSearchParams();
  const billing = useWorkspace((state) => state.billing);
  const workspace = useWorkspace((state) => state.workspace);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let ignore = false;
    void refreshBilling()
      .then((next) => {
        if (!ignore && next.active) return loadSession();
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const returned = Boolean(
      searchParams.get("subscription_id") ||
        searchParams.get("payment_id") ||
        searchParams.get("status"),
    );
    if (returned) setConfirming(true);
  }, [searchParams]);

  useEffect(() => {
    if (!confirming) return;
    let stopped = false;
    let tries = 0;
    async function poll() {
      tries += 1;
      try {
        const next = await refreshBilling();
        if (stopped) return;
        if (next.active) {
          await loadSession();
          setNotice("Pagamento confirmado. O espaço está liberado.");
          setConfirming(false);
          return;
        }
      } catch {
        if (!stopped) setError("Ainda não confirmamos o pagamento.");
      }
      if (stopped || tries >= 20) {
        if (!stopped) setConfirming(false);
        return;
      }
      window.setTimeout(() => {
        void poll();
      }, 2000);
    }
    void poll();
    return () => {
      stopped = true;
    };
  }, [confirming]);

  async function open() {
    if (!billing || billing.action === "none") return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const session = billing.action === "checkout" ? await startCheckout() : await openBillingPortal();
      window.location.assign(session.url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Não foi possível abrir o pagamento.");
      setBusy(false);
    }
  }

  async function changeMix(extraSeats: number, seatPacks: number) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const session = await updateSeats({ extraSeats, seatPacks });
      if (session.url) {
        window.location.assign(session.url);
        return;
      }
      setNotice("Pedido enviado. A capacidade muda quando o Dodo confirmar o pagamento.");
      await refreshBilling();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Não foi possível atualizar as vagas.");
    } finally {
      setBusy(false);
    }
  }

  async function switchPeriod(period: "month" | "quarter") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const session = await updateBillingPeriod(period);
      if (session.url) {
        window.location.assign(session.url);
        return;
      }
      setNotice("Pedido enviado. O período muda quando o Dodo confirmar o pagamento.");
      await refreshBilling();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Não foi possível trocar o período.");
    } finally {
      setBusy(false);
    }
  }

  async function reload() {
    setError("");
    setBusy(true);
    try {
      const next = await refreshBilling();
      if (next.active) await loadSession();
      setNotice("Situação atualizada.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Não foi possível atualizar.");
    } finally {
      setBusy(false);
    }
  }

  const period = formatDate(billing?.currentPeriodEnd ?? null);
  const seats = billing?.seats;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-ink">Assinatura</h2>
        <p className="mt-1 text-sm text-faint">
          O plano mensal libera todas as funções
          {workspace ? ` de ${workspace.name}` : " do espaço"}. O pagamento é confirmado pelo Dodo
          Payments.
        </p>
      </div>
      <Card className="border-none">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-faint">Plano</dt>
            <dd className="mt-1 text-sm text-ink">{billing?.productName ?? "Plano mensal"}</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Valor</dt>
            <dd className="mt-1 text-sm text-ink">{billing?.priceLabel ?? "Cobrança mensal"}</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Situação</dt>
            <dd className="mt-1 text-sm text-ink">{billing?.statusLabel ?? "Sem assinatura"}</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Próxima cobrança</dt>
            <dd className="mt-1 text-sm text-ink">
              {period ?? "—"}
              {billing?.cancelAtPeriodEnd ? " · cancelamento agendado" : ""}
            </dd>
          </div>
        </dl>
        {billing?.cancelAtPeriodEnd ? (
          <p className="mt-4 text-sm text-muted">
            A assinatura não renova. O acesso segue até o fim do período já pago.
          </p>
        ) : null}
        {confirming ? <p className="mt-4 text-sm text-muted">Confirmando o pagamento…</p> : null}
        {notice ? <p className="mt-4 text-sm text-muted">{notice}</p> : null}
        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
        {seats ? (
          <div className="mt-6 space-y-3 border-t border-line pt-4">
            <p className="text-sm text-ink">
              {seats.usageLabel}
              <span className="text-faint"> · {seats.periodLabel} · {seats.totalLabel}</span>
            </p>
            <p className="text-sm text-faint">
              {seats.included} pessoas incluídas
              {seats.extraSeats > 0
                ? ` · ${seats.extraSeats === 1 ? "1 avulsa" : `${seats.extraSeats} avulsas`}`
                : ""}
              {seats.seatPacks > 0
                ? ` · ${seats.seatPacks === 1 ? "1 combo +5" : `${seats.seatPacks} combos +5`}`
                : ""}
              . A conta soma as pessoas de todos os espaços, no máximo {seats.max}.
            </p>
            {seats.people >= seats.max ? (
              <p className="text-sm text-muted">O plano aceita no máximo 15 pessoas. Não há vaga acima disso.</p>
            ) : null}
            {seats.purchasable ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || confirming || !seats.canAddSingle}
                  onClick={() => void changeMix(seats.extraSeats + 1, seats.seatPacks)}
                >
                  Adicionar 1 pessoa ({seats.singlePriceLabel})
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || confirming || !seats.canAddPack}
                  onClick={() => void changeMix(seats.extraSeats, seats.seatPacks + 1)}
                >
                  Adicionar combo +5 ({seats.packPriceLabel})
                </Button>
                {seats.canRemoveSingle ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy || confirming}
                    onClick={() => void changeMix(seats.extraSeats - 1, seats.seatPacks)}
                  >
                    Remover 1 avulsa
                  </Button>
                ) : null}
                {seats.canRemovePack ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy || confirming}
                    onClick={() => void changeMix(seats.extraSeats, seats.seatPacks - 1)}
                  >
                    Remover combo +5
                  </Button>
                ) : null}
                {seats.canSwitchPeriod ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || confirming}
                    onClick={() => void switchPeriod(seats.period === "month" ? "quarter" : "month")}
                  >
                    {seats.period === "month" ? "Mudar para trimestral" : "Mudar para mensal"}
                  </Button>
                ) : null}
              </div>
            ) : billing?.action === "checkout" ? (
              <p className="text-sm text-faint">As vagas extras ficam disponíveis depois da assinatura.</p>
            ) : null}
          </div>
        ) : null}
        {billing?.configured === false ? (
          <p className="mt-4 text-sm text-faint">
            As chaves do Dodo Payments ainda não estão no servidor. O botão passa a abrir o checkout
            assim que elas forem configuradas.
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          {billing?.action === "checkout" ? (
            <Button type="button" disabled={busy || confirming} onClick={() => void open()}>
              {busy ? "Abrindo…" : "Assinar plano mensal"}
            </Button>
          ) : null}
          {billing?.action === "portal" ? (
            <Button type="button" disabled={busy || confirming} onClick={() => void open()}>
              {busy ? "Abrindo…" : "Gerenciar no Dodo"}
            </Button>
          ) : null}
          {billing?.action === "none" ? (
            <p className="text-sm text-muted">
              Peça a um administrador deste espaço para assinar ou alterar o pagamento.
            </p>
          ) : null}
          <Button type="button" variant="outline" disabled={busy || confirming} onClick={() => void reload()}>
            Atualizar situação
          </Button>
        </div>
      </Card>
    </section>
  );
}
