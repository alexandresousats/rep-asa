"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { normalizeSettingsTab, SettingsDialog } from "@/components/settings/settings-dialog";

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-base" />}>
      <SettingsRoute />
    </Suspense>
  );
}

function SettingsRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = normalizeSettingsTab(searchParams.get("tab"));

  return (
    <SettingsDialog
      open
      tab={tab}
      onTabChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", next);
        router.replace(`/configuracoes?${params.toString()}`, { scroll: false });
      }}
      onClose={() => router.push("/")}
    />
  );
}
