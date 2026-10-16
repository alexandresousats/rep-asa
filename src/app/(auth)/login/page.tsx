"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("alexandre@asa.app");
  const [password, setPassword] = useState("asa123");
  const [error, setError] = useState("");

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
          const result = login(email, password);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.replace("/");
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
