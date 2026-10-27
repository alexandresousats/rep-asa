"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoogleAuthButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signup } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  return (
    <div>
      <h1 className="mb-2 text-center text-2xl font-medium tracking-tight text-ink">
        Criar conta
      </h1>
      <p className="mb-8 text-center text-sm text-faint">
        Comece um workspace da equipe.
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void signup({ name, email, password }).then((result) => {
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.replace("/");
          });
        }}
      >
        <Input
          label="Nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
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
          minLength={6}
          required
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button type="submit" className="w-full">
          Cadastrar
        </Button>
      </form>
      <p className="my-6 text-center text-xs text-faint">ou</p>
      <GoogleAuthButton />
      <p className="mt-6 text-center text-sm text-faint">
        Já tem conta?{" "}
        <Link href="/login" className="text-ink">
          Entrar
        </Link>
      </p>
    </div>
  );
}
