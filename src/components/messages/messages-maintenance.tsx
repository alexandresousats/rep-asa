import { MaintenanceGate } from "@/components/layout/maintenance-gate";
import { DiscordPreview } from "@/components/messages/discord-preview";

export function MessagesMaintenance() {
  return (
    <MaintenanceGate description="As mensagens estão temporariamente indisponíveis enquanto fazemos melhorias. Volte em breve.">
      <DiscordPreview />
    </MaintenanceGate>
  );
}
