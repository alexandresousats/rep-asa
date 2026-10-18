"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestReset } from "@/lib/api";

export default function ResetRequestPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [link, setLink] = useState("");

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
              setLink("");
              return;
            }
            setError("");
            setLink(`/redefinir/nova?token=${result.token}`);
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
      {link ? (
        <p className="mt-6 text-center text-sm text-muted">
          Sem e-mail real nesta fase. Use{" "}
          <Link href={link} className="text-ink underline">
            este link
          </Link>
          .
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
