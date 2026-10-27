"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function RedirectToBilling() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "assinatura");
    router.replace(`/configuracoes?${params.toString()}`);
  }, [router, searchParams]);

  return null;
}

export default function AssinaturaPage() {
  return (
    <Suspense fallback={null}>
      <RedirectToBilling />
    </Suspense>
  );
}
