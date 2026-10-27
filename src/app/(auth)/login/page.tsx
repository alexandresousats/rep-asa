"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { FirebaseError } from "firebase/app";
import { GoogleAuthButton, googleAuthError } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginWithFirebase } from "@/lib/api";
import { signInWithEmail } from "@/lib/firebase";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(googleAuthError(params.get("erro")));
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <h1 className="mb-2 text-center text-2xl font-medium tracking-tight text-ink">
        Entrar
      </h1>
      <p className="mb-8 text-center text-sm text-faint">
        Continue o trabalho da equipe.
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          void signInWithEmail(email, password)
            .then(async (idToken) => {
              const result = await loginWithFirebase(idToken);
              if (!result.ok) {
                setError(result.error);
                setBusy(false);
                return;
              }
              router.replace("/");
            })
            .catch((caught: unknown) => {
              setBusy(false);
              if (
                caught instanceof FirebaseError &&
                (caught.code === "auth/user-not-found" ||
                  caught.code === "auth/invalid-credential" ||
                  caught.code === "auth/invalid-login-credentials" ||
                  caught.code === "auth/wrong-password")
              ) {
                setError("E-mail ou senha inválidos.");
                return;
              }
              if (caught instanceof FirebaseError && caught.code === "auth/too-many-requests") {
                setError("Muitas tentativas. Espere alguns minutos.");
                return;
              }
              setError("Não foi possível entrar.");
            });
        }}
      >
        <Input
          label="E-mail"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Input
          label="Senha"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          Entrar
        </Button>
      </form>
      <p className="my-6 text-center text-xs text-faint">ou</p>
      <GoogleAuthButton />
      <div className="mt-6 space-y-2 text-center text-sm text-faint">
        <p>
          <Link href="/redefinir" className="hover:text-ink">
            Esqueci a senha
          </Link>
        </p>
        <p>
          Não tem conta?{" "}
          <Link href="/cadastro" className="text-ink">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center text-sm text-faint">Carregando…</div>}>
      <LoginForm />
    </Suspense>
  );
}
