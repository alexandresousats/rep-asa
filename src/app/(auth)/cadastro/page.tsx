"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FirebaseError } from "firebase/app";
import { GoogleAuthButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginWithFirebase } from "@/lib/api";
import { signUpWithEmail } from "@/lib/firebase";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
          setBusy(true);
          setError("");
          void signUpWithEmail({ name, email, password })
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
              if (caught instanceof FirebaseError && caught.code === "auth/email-already-in-use") {
                setError("Este e-mail já tem conta. Entre ou redefina a senha.");
                return;
              }
              if (caught instanceof FirebaseError && caught.code === "auth/weak-password") {
                setError("A senha precisa ter pelo menos 6 caracteres.");
                return;
              }
              if (caught instanceof FirebaseError && caught.code === "auth/invalid-email") {
                setError("Informe um e-mail válido.");
                return;
              }
              setError("Não foi possível criar a conta.");
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
        <Button type="submit" className="w-full" disabled={busy}>
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
