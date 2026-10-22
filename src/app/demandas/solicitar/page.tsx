"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";

function RedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(`/solicitar-demanda${qs ? `?${qs}` : ""}`);
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0d0d0d] text-zinc-100">
      <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
    </div>
  );
}

export default function DemandsSolicitarRedirect() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0d0d0d] text-zinc-100">
          <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
        </div>
      }
    >
      <RedirectContent />
    </Suspense>
  );
}
