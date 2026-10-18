"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/layout/logo";
import { useWorkspace } from "@/lib/workspace";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ready = useWorkspace((state) => state.ready);
  const user = useWorkspace((state) => state.user);

  useEffect(() => {
    if (ready && user) {
      router.replace("/");
    }
  }, [ready, user, router]);

  if (!ready) {
    return <div className="min-h-screen bg-base" />;
  }

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
