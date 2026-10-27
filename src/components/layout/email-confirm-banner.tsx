"use client";

import { useState } from "react";
import { resendEmailConfirmation } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace";

export function EmailConfirmBanner() {
  const user = useWorkspace((state) => state.user);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
            void resendEmailConfirmation().then((result) => {
              setBusy(false);
              if (!result.ok) {
                setSent(false);
                setError(result.error);
                return;
              }
              setSent(true);
            });
          }}
        >
          Reenviar e-mail
        </button>
      </div>
    </div>
  );
}
