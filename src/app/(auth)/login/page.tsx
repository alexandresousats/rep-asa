"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { GoogleAuthButton, googleAuthError } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(googleAuthError(params.get("erro")));

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
          void login(email, password).then((result) => {
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.replace("/");
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
        <Button type="submit" className="w-full">
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
