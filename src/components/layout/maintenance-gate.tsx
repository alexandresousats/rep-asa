"use client";

import { Construction } from "lucide-react";

export function MaintenanceGate({
  description,
  children,
}: {
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div aria-hidden inert className="pointer-events-none h-full select-none blur-[6px] saturate-50">
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-base/45 px-6">
        <div className="flex max-w-sm flex-col items-center rounded-3xl border border-line bg-elevated px-8 py-8 text-center shadow-[0_16px_50px_rgba(0,0,0,0.12)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-hover text-muted">
            <Construction className="h-6 w-6" strokeWidth={1.5} aria-hidden />
          </div>
          <h1 className="mt-4 text-lg font-medium text-ink">Em manutenção</h1>
          <p className="mt-2 text-sm leading-6 text-faint">{description}</p>
        </div>
      </div>
    </div>
  );
}
