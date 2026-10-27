"use client";

import { FirebaseError } from "firebase/app";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginWithFirebase } from "@/lib/api";
import { signInWithGoogle } from "@/lib/firebase";

export function googleAuthError(code: string | null) {
  if (code === "google") return "Login com Google ainda não está configurado.";
  if (code === "google_unverified") return "O Google não confirmou este e-mail.";
  if (code === "google_denied") return "O login com Google foi cancelado.";
  if (code === "google_failed") return "Não foi possível entrar com o Google.";
  return "";
}

export function GoogleAuthButton() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={busy}
        className="inline-flex h-10 w-full items-center justify-center rounded-full border border-line text-sm font-medium text-ink hover:bg-elevated disabled:opacity-40"
        onClick={() => {
          setBusy(true);
          setError("");
          void signInWithGoogle()
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
                (caught.code === "auth/popup-closed-by-user" ||
                  caught.code === "auth/cancelled-popup-request")
              ) {
                return;
              }
              setError("Não foi possível entrar com o Google.");
            });
        }}
      >
        Continuar com Google
      </button>
      {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
