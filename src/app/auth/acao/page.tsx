"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginWithFirebase } from "@/lib/api";
import {
  applyFirebaseActionCode,
  confirmFirebasePasswordReset,
  firebaseActionError,
  lookupFirebasePasswordReset,
  recoverFirebaseEmail,
  refreshFirebaseVerification,
  signInWithEmail,
} from "@/lib/firebase";

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base px-6 py-16">
      <div className="mb-10 flex items-center gap-2">
        <Logo />
        <span className="text-sm font-medium tracking-tight text-ink">ASA</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

function FirebaseAction() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get("mode") ?? "";
  const code = params.get("oobCode") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState("");

  useEffect(() => {
    if (!code || (mode !== "resetPassword" && mode !== "verifyEmail" && mode !== "verifyAndChangeEmail" && mode !== "recoverEmail")) {
      setError("Link inválido ou expirado.");
      setReady(true);
      return;
    }
    let stopped = false;
    const finish = (message: string) => {
      if (stopped) return;
      setError(message);
      setReady(true);
    };
    if (mode === "resetPassword") {
      void lookupFirebasePasswordReset(code)
        .then((account) => {
          if (stopped) return;
          setEmail(account);
          setReady(true);
        })
        .catch((caught: unknown) => finish(firebaseActionError(caught)));
      return () => {
        stopped = true;
      };
    }
    if (mode === "recoverEmail") {
      void recoverFirebaseEmail(code)
        .then((restored) => {
          if (stopped) return;
          setDone(restored ? `O e-mail ${restored} foi restaurado.` : "Seu e-mail foi restaurado.");
          setReady(true);
        })
        .catch((caught: unknown) => finish(firebaseActionError(caught)));
      return () => {
        stopped = true;
      };
    }
    void applyFirebaseActionCode(code)
      .then(async () => {
        if (stopped) return;
        const idToken = await refreshFirebaseVerification();
        if (idToken) {
          const result = await loginWithFirebase(idToken);
          if (result.ok) {
            router.replace("/");
            return;
          }
        }
        if (stopped) return;
        setDone("Seu e-mail está confirmado.");
        setReady(true);
      })
      .catch((caught: unknown) => finish(firebaseActionError(caught)));
    return () => {
      stopped = true;
    };
  }, [code, mode, router]);

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("A confirmação da senha não confere.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await confirmFirebasePasswordReset(code, password);
      const idToken = await signInWithEmail(email, password);
      const result = await loginWithFirebase(idToken);
      if (!result.ok) {
        router.replace("/login");
        return;
      }
      router.replace("/");
    } catch (caught) {
      setBusy(false);
      setError(firebaseActionError(caught));
    }
  }

  const resetting = mode === "resetPassword" && email;
  const title = !ready
    ? "Aguarde"
    : resetting
      ? "Nova senha"
      : done
        ? mode === "recoverEmail"
          ? "E-mail restaurado"
          : "E-mail confirmado"
        : "Link inválido";

  return (
    <AuthFrame>
      <h1 className="mb-2 text-center text-2xl font-medium tracking-tight text-ink">{title}</h1>
      {!ready ? (
        <p className="text-center text-sm text-faint">Carregando…</p>
      ) : resetting ? (
        <>
          <p className="mb-8 text-center text-sm text-faint">
            Defina uma senha nova para {email}.
          </p>
          <form className="space-y-4" onSubmit={(event) => void savePassword(event)}>
            <Input
              label="Nova senha"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
            <Input
              label="Confirmar nova senha"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              Salvar senha
            </Button>
          </form>
        </>
      ) : (
        <div className="text-center">
          <p className="mb-8 text-sm text-faint">{done || error || "Não foi possível usar este link."}</p>
          {done ? (
            <Button type="button" className="w-full" onClick={() => router.replace("/login")}>
              Entrar
            </Button>
          ) : null}
        </div>
      )}
      <p className="mt-6 text-center text-sm text-faint">
        <Link href="/login" className="hover:text-ink">
          Voltar ao login
        </Link>
      </p>
    </AuthFrame>
  );
}

export default function FirebaseActionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-base" />}>
      <FirebaseAction />
    </Suspense>
  );
}
