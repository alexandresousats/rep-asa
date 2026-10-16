"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmReset } from "@/lib/api";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  return (
    <div>
      <h1 className="mb-2 text-center text-2xl font-medium tracking-tight text-ink">
        Nova senha
      </h1>
      <p className="mb-8 text-center text-sm text-faint">
        Defina uma senha nova para a sua conta.
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const result = confirmReset(token, password);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.replace("/login");
        }}
      >
        <Input
          label="Nova senha"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={6}
          required
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button type="submit" className="w-full">
          Salvar senha
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-faint">
        <Link href="/login" className="hover:text-ink">
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}

export default function ResetConfirmPage() {
  return (
    <Suspense fallback={<div className="text-center text-sm text-faint">Carregando…</div>}>
      <ResetForm />
    </Suspense>
  );
}
