import { MessageSquare } from "lucide-react";

export function MessagesMaintenance() {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-elevated text-muted">
        <MessageSquare className="h-7 w-7" aria-hidden />
      </div>
      <h1 className="mt-5 text-lg font-medium text-ink">Em manutenção</h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-faint">
        As mensagens estão temporariamente indisponíveis enquanto fazemos melhorias. Volte em breve.
      </p>
    </div>
  );
}
