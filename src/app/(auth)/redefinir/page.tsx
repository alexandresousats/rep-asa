"use client";

import Link from "next/link";
import { useState } from "react";
import { FirebaseError } from "firebase/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendFirebasePasswordReset } from "@/lib/firebase";

export default function ResetRequestPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

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
          setBusy(true);
          setError("");
          setSent(false);
          void sendFirebasePasswordReset(email)
            .then(() => {
              setSent(true);
              setBusy(false);
            })
            .catch((caught: unknown) => {
              setBusy(false);
              const absent =
                caught instanceof FirebaseError &&
                (caught.code === "auth/user-not-found" || caught.code === "auth/invalid-credential");
              if (absent) {
                setSent(true);
                return;
              }
              if (caught instanceof FirebaseError && caught.code === "auth/invalid-email") {
                setError("Informe um e-mail válido.");
                return;
              }
              if (caught instanceof FirebaseError && caught.code === "auth/too-many-requests") {
                setError("Muitas tentativas. Espere alguns minutos.");
                return;
              }
              setError("Não foi possível enviar o link.");
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
        <Button type="submit" className="w-full" disabled={busy}>
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
