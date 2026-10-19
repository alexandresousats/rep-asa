"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestReset } from "@/lib/api";

export default function ResetRequestPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <div>
      <h1 className="mb-2 text-center text-2xl font-medium tracking-tight text-ink">
        Redefinir senha
      </h1>
      <p className="mb-8 text-center text-sm text-faint">
        Enviaremos um link de redefinição.
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void requestReset(email).then((result) => {
            if (!result.ok) {
              setError(result.error);
              setSent(false);
              return;
            }
            setError("");
            setSent(true);
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
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button type="submit" className="w-full">
          Enviar link
        </Button>
      </form>
      {sent ? (
        <p className="mt-6 text-center text-sm text-muted">
          Se este e-mail tiver conta, enviamos o link.
        </p>
      ) : null}
      <p className="mt-6 text-center text-sm text-faint">
        <Link href="/login" className="hover:text-ink">
          Voltar ao login
        </Link>
      </p>
    </div>
  );
}
