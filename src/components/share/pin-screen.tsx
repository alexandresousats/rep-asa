"use client";

import { Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { unlockShare, type PublicBrand } from "@/lib/api/public-share";
import { cn } from "@/lib/cn";
import { BrandMark } from "./brand-mark";

const EMPTY = ["", "", "", ""];

export function PinScreen({
  token,
  workspace,
  onUnlocked,
}: {
  token: string;
  workspace: PublicBrand;
  onUnlocked: () => void;
}) {
  const [digits, setDigits] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  async function submit(pin: string) {
    setBusy(true);
    setError("");
    try {
      await unlockShare(token, pin);
      onUnlocked();
    } catch (reason) {
      const status = reason instanceof ApiError ? reason.status : 0;
      setError(
        status === 429
          ? reason instanceof Error
            ? reason.message
            : "Muitas tentativas. Tente de novo em alguns minutos."
          : status === 401
            ? "PIN incorreto, tente de novo."
            : "Não foi possível verificar o PIN. Tente de novo.",
      );
      setDigits(EMPTY);
      setShake((value) => value + 1);
      setBusy(false);
      requestAnimationFrame(() => refs.current[0]?.focus());
    }
  }

  function fill(index: number, raw: string) {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    const next = [...digits];
    // Colar ou o preenchimento automático do SMS trazem vários dígitos de uma vez.
    for (let offset = 0; offset < typed.length && index + offset < 4; offset += 1) {
      next[index + offset] = typed[offset];
    }
    setDigits(next);
    setError("");
    const filled = next.findIndex((digit) => digit === "");
    if (filled === -1) {
      refs.current[3]?.blur();
      void submit(next.join(""));
      return;
    }
    refs.current[Math.min(index + typed.length, 3)]?.focus();
  }

  function onKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = "";
      } else if (index > 0) {
        next[index - 1] = "";
        refs.current[index - 1]?.focus();
      }
      setDigits(next);
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < 3) refs.current[index + 1]?.focus();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <BrandMark brand={workspace} size="lg" />
        <p className="mt-3 text-sm font-medium text-muted">{workspace.name}</p>
        <div className="mt-10 flex h-12 w-12 items-center justify-center rounded-full bg-elevated">
          <Lock className="h-5 w-5 text-ink" strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-ink">Digite o PIN</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Use o PIN de 4 dígitos que você recebeu.
        </p>
        <form
          key={shake}
          onSubmit={(event) => {
            event.preventDefault();
            if (digits.every(Boolean)) void submit(digits.join(""));
          }}
          className={cn("mt-8 flex gap-3", shake > 0 && "animate-[pin-shake_0.35s_ease-in-out]")}
        >
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(node) => {
                refs.current[index] = node;
              }}
              aria-label={`Dígito ${index + 1} de 4`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={index === 0 ? 4 : 1}
              disabled={busy}
              value={digit}
              onChange={(event) => fill(index, event.target.value)}
              onPaste={(event) => {
                event.preventDefault();
                fill(0, event.clipboardData.getData("text"));
              }}
              onKeyDown={(event) => onKeyDown(index, event)}
              onFocus={(event) => event.target.select()}
              className={cn(
                "h-16 w-14 rounded-2xl border bg-elevated text-center font-mono text-2xl font-semibold text-ink outline-none transition-colors",
                "focus:border-ink focus:ring-4 focus:ring-ink/10 disabled:opacity-60",
                error ? "border-red-400" : "border-line",
              )}
            />
          ))}
        </form>
        <p role="alert" className="mt-5 min-h-6 text-sm text-red-500 dark:text-red-400">
          {busy ? <span className="text-muted">Verificando…</span> : error}
        </p>
      </div>
    </main>
  );
}
