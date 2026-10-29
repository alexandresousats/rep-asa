"use client";

import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { DemandChat, type DemandChatApi } from "@/components/demands/demand-chat";
import { chatWithDemandAgent, getDemandLinkInfo, submitDemandViaLink } from "@/lib/api";

function VerifiedDemandChat() {
  const token = useSearchParams().get("token") || "";
  const api = useMemo<DemandChatApi>(
    () => ({
      info: async () => {
        if (!token) throw new Error("Nenhum token de verificação foi fornecido na URL.");
        return getDemandLinkInfo(token);
      },
      chat: (messages, state) => chatWithDemandAgent(token, messages, state),
      submit: (demand) => submitDemandViaLink(token, demand),
    }),
    [token],
  );
  return <DemandChat api={api} />;
}

export default function DemandRequestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0d0d0d] text-zinc-100">
          <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
        </div>
      }
    >
      <VerifiedDemandChat />
    </Suspense>
  );
}
