"use client";

import { AlertCircle, Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type ToastState = { text: string; kind: "success" | "error" };

export function useToast(duration = 3000) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (text: string, kind: ToastState["kind"] = "success") => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ text, kind });
      timer.current = setTimeout(() => setToast(null), duration);
    },
    [duration],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const node = toast ? (
    <div
      role="status"
      className="fixed bottom-6 right-6 left-6 z-[80] mx-auto flex w-fit max-w-full items-center gap-2 rounded-2xl border border-line bg-elevated px-4 py-2.5 text-xs font-medium text-ink shadow-2xl sm:left-auto"
    >
      {toast.kind === "success" ? (
        <Check className="h-4 w-4 shrink-0 text-emerald-500" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
      )}
      <span>{toast.text}</span>
    </div>
  ) : null;

  return { show, node };
}
