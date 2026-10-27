"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { confirmEmail, loadSession } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

function ConfirmEmail() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Link inválido ou expirado.");
      return;
    }
    let stopped = false;
    void confirmEmail(token).then(async (result) => {
      if (stopped) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await loadSession();
      if (stopped) return;
      if (useWorkspace.getState().user) {
        router.replace("/");
        return;
      }
      setDone(true);
    });
    return () => {
      stopped = true;
    };
  }, [router, token]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base px-6 py-16">
      <div className="mb-10 flex items-center gap-2">
        <Logo />
        <span className="text-sm font-medium tracking-tight text-ink">ASA</span>
      </div>
      <div className="w-full max-w-sm text-center">
        <h1 className="mb-2 text-2xl font-medium tracking-tight text-ink">Confirmar e-mail</h1>
        <p className="mb-8 text-sm text-faint">
          {done ? "Seu e-mail está confirmado." : "Vamos marcar este e-mail como confirmado."}
        </p>
        {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
        {done ? (
          <Button type="button" className="w-full" onClick={() => router.replace("/login")}>
            Entrar
          </Button>
        ) : error ? null : (
          <p className="text-sm text-muted">Confirmando…</p>
        )}
        <p className="mt-6 text-sm text-faint">
          <Link href="/login" className="hover:text-ink">
            Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-base" />}>
      <ConfirmEmail />
    </Suspense>
  );
}
