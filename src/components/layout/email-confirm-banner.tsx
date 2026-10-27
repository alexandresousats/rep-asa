"use client";

import { useEffect, useState } from "react";
import { loginWithFirebase } from "@/lib/api";
import { refreshFirebaseVerification, resendFirebaseVerification } from "@/lib/firebase";
import { useWorkspace } from "@/lib/workspace";

export function EmailConfirmBanner() {
  const user = useWorkspace((state) => state.user);
  const userId = user?.id;
  const verified = user?.emailVerified;
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId || verified !== false) return;
    let stopped = false;
    void refreshFirebaseVerification().then(async (idToken) => {
      if (stopped || !idToken) return;
      await loginWithFirebase(idToken);
    });
    return () => {
      stopped = true;
    };
  }, [userId, verified]);

  if (!user || user.emailVerified !== false) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-elevated px-4 py-3 text-sm text-ink">
      <p>
        Confirme <span className="font-medium">{user.email}</span> para proteger a conta. Enviamos um
        link de confirmação.
      </p>
      <div className="flex items-center gap-3">
        {sent ? <span className="text-faint">Enviamos outro link.</span> : null}
        {error ? <span className="text-red-400">{error}</span> : null}
        <button
          type="button"
          disabled={busy}
          className="rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:bg-hover disabled:opacity-40"
          onClick={() => {
            setBusy(true);
            setError("");
            void resendFirebaseVerification()
              .then((sentByFirebase) => {
                setBusy(false);
                if (!sentByFirebase) {
                  setSent(false);
                  setError("Entre de novo para reenviar o e-mail de confirmação.");
                  return;
                }
                setSent(true);
              })
              .catch(() => {
                setBusy(false);
                setSent(false);
                setError("Não foi possível reenviar o e-mail.");
              });
          }}
        >
          Reenviar e-mail
        </button>
      </div>
    </div>
  );
}
