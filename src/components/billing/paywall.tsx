"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  loadSession,
  logout,
  openBillingPortal,
  refreshBilling,
  selectWorkspace,
  startCheckout,
} from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { useWorkspace } from "@/lib/workspace";
import { WorkspaceInviteCards } from "../layout/workspace-invite-cards";
import { Logo } from "../layout/logo";

export function Paywall() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const billing = useWorkspace((state) => state.billing);
  const workspace = useWorkspace((state) => state.workspace);
  const workspaces = useWorkspace((state) => state.workspaces);
  const user = useWorkspace((state) => state.user);
  const invites = useWorkspace((state) => state.invites);
  const returnedFromCheckout = Boolean(
    searchParams.get("subscription_id") || searchParams.get("status"),
  );
  const [confirming, setConfirming] = useState(returnedFromCheckout);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
          router.replace("/");
          return;
        }
      } catch {
        if (!stopped) setError("Ainda não confirmamos o pagamento.");
      }
      if (stopped || tries >= 30) {
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
  }, [confirming, router]);

  async function subscribe() {
    setBusy(true);
    setError("");
    try {
      const session =
        billing?.action === "portal" ? await openBillingPortal() : await startCheckout();
      window.location.assign(session.url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Não foi possível abrir o pagamento.");
      setBusy(false);
    }
  }

  const period = billing?.currentPeriodEnd
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(billing.currentPeriodEnd))
    : null;

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-[20px] border border-line bg-elevated p-8">
        <Logo />
        <h1 className="mt-6 text-2xl font-medium tracking-tight text-ink">Plano mensal</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {workspace
            ? `${workspace.name} ainda não tem uma assinatura ativa. O pagamento libera todas as funções deste espaço.`
            : "O pagamento libera todas as funções do espaço de trabalho."}
        </p>
        {invites.length > 0 ? (
          <div className="mt-6">
            <p className="text-sm font-medium text-ink">Convites</p>
            <p className="mt-1 mb-4 text-sm leading-6 text-muted">
              Aceite para entrar no espaço atribuído. O plano e as vagas ficam com o administrador
              desse espaço.
            </p>
            <WorkspaceInviteCards />
          </div>
        ) : null}
        {billing?.priceLabel ? (
          <p className="mt-6 text-3xl font-medium tracking-tight text-ink">
            {billing.priceLabel}
          </p>
        ) : (
          <p className="mt-6 text-sm text-muted">{billing?.productName ?? "Um plano, cobrado todo mês."}</p>
        )}
        {billing?.status && billing.status !== "active" ? (
          <p className="mt-3 text-sm text-faint">
            Situação: {billing.statusLabel}
            {period && billing.cancelAtPeriodEnd ? ` · acesso até ${period}` : ""}
          </p>
        ) : null}
        {confirming ? (
          <p className="mt-6 text-sm text-muted">Confirmando o pagamento…</p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
        {billing?.configured === false ? (
          <p className="mt-6 text-sm text-faint">
            Os pagamentos ainda não estão configurados neste ambiente.
          </p>
        ) : billing?.action === "none" ? (
          <p className="mt-6 text-sm text-muted">
            Peça a um administrador de {workspace?.name ?? "este espaço"} para assinar o plano.
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-2">
            <Button type="button" disabled={busy || confirming} onClick={() => void subscribe()}>
              {busy
                ? "Abrindo…"
                : billing?.action === "portal"
                  ? "Atualizar pagamento"
                  : "Assinar plano mensal"}
            </Button>
            {!confirming ? (
              <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
                Já paguei, atualizar
              </Button>
            ) : null}
          </div>
        )}
        <button
          type="button"
          className="mt-4 text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
          onClick={() => router.push("/configuracoes?tab=assinatura")}
        >
          Gerir em configurações
        </button>
        {workspaces.length > 1 ? (
          <label className="mt-6 block text-sm text-muted">
            Espaço de trabalho
            <select
              className="mt-2 h-10 w-full rounded-full border border-line bg-base px-3 text-sm text-ink"
              value={workspace?.id ?? ""}
              onChange={(event) => {
                void selectWorkspace(event.target.value).catch(() => {
                  setError("Não foi possível trocar de espaço.");
                });
              }}
            >
              {workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className="mt-6 text-sm text-faint hover:text-ink"
          onClick={() => {
            void logout().then(() => router.replace("/login"));
          }}
        >
          Sair{user?.email ? ` · ${user.email}` : ""}
        </button>
      </div>
    </div>
  );
}
