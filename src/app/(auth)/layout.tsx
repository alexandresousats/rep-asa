"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/layout/logo";
import { useAppStore } from "@/lib/store";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const currentUserId = useAppStore((state) => state.currentUserId);

  useEffect(() => {
    if (hasHydrated && currentUserId) {
      router.replace("/");
    }
  }, [hasHydrated, currentUserId, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base px-6 py-16">
      <div className="mb-10 flex items-center gap-2">
        <Logo />
        <span className="text-sm font-medium tracking-tight text-ink">ASA</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
