"use client";

import { MoreVertical } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";

export function ProjectActionsMenu({
  onEdit,
  onAddMember,
  onDelete,
}: {
  onEdit: () => void;
  onAddMember: () => void;
  onDelete: () => void;
}) {
  return (
    <ActionMenu
      label="Opções do projeto"
      icon={MoreVertical}
      isolate
      triggerClassName="p-1 hover:bg-base"
      iconClassName="h-3.5 w-3.5"
      menuClassName="min-w-40"
      items={[
        { id: "edit", label: "Editar", onSelect: onEdit },
        { id: "member", label: "Adicionar membro", onSelect: onAddMember },
        { id: "delete", label: "Excluir", variant: "danger", onSelect: onDelete },
      ]}
    />
  );
}
