"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";
import { ClientSharePage } from "@/components/share/client-share-page";

export default function ClientSharePageRoute() {
  const params = useParams<{ token: string }>();
  return (
    <Suspense fallback={<div className="min-h-dvh bg-base" />}>
      <ClientSharePage token={params.token} />
    </Suspense>
  );
}
