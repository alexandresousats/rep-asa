"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import {
  Bell,
  Building2,
  Cpu,
  CreditCard,
  Hash,
  Palette,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";
import { CreateWorkspaceDialog } from "@/components/layout/create-workspace-dialog";
import { MemberForm } from "@/components/team/member-dialog";
import { WorkspaceTeamSection } from "@/components/team/workspace-team-section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AgentSettingsCard } from "@/components/settings/agent-settings";
import { BillingSettings } from "@/components/settings/billing-card";
import { NotificationSettings } from "@/components/settings/notification-settings";
import { ApiKeysCard } from "@/components/settings/api-keys";
import { CsvBackupCard } from "@/components/settings/csv-backup";
import { TagsManager } from "@/components/settings/tags-manager";
import { WorkspaceLogoCard } from "@/components/settings/workspace-logo";
import {
  createMcpServer,
  deleteMcpServer,
  deleteWorkspace,
  renameWorkspace,
  updateMcpServer,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { usePrefs } from "@/lib/prefs";
import type { McpTransport, WorkspaceMembership } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";

export type SettingsTab =
  | "perfil"
  | "aparencia"
  | "assinatura"
  | "equipe"
  | "workspace"
  | "notificacoes"
  | "agente"
  | "mcp"
  | "tags";

const GROUPS: { label: string; items: { id: SettingsTab; label: string; icon: typeof User }[] }[] = [
  {
    label: "Geral",
    items: [
      { id: "perfil", label: "Conta", icon: User },
      { id: "aparencia", label: "Aparência", icon: Palette },
      { id: "workspace", label: "Espaço de trabalho", icon: Building2 },
      { id: "notificacoes", label: "Notificações", icon: Bell },
    ],
  },
  {
    label: "Equipe",
    items: [{ id: "equipe", label: "Equipe", icon: Users }],
  },
  {
    label: "Agente",
    items: [
      { id: "agente", label: "Agente de IA", icon: Sparkles },
      { id: "mcp", label: "MCP", icon: Cpu },
    ],
  },
  {
    label: "Pagamentos",
    items: [{ id: "assinatura", label: "Assinatura", icon: CreditCard }],
  },
  {
    label: "Organização",
    items: [{ id: "tags", label: "Tags", icon: Hash }],
  },
];

export function normalizeSettingsTab(param: string | null): SettingsTab {
  if (!param) return "perfil";
  const lower = param.toLowerCase();
  if (
    lower === "workspace" ||
    lower === "espaco" ||
    lower === "espaco-de-trabalho" ||
    lower === "espaço de trabalho"
  ) {
    return "workspace";
  }
  if (lower === "notificacoes" || lower === "notificações" || lower === "notifications") {
    return "notificacoes";
  }
  if (lower === "assinatura" || lower === "billing" || lower === "plano") return "assinatura";
  if (lower === "equipe" || lower === "team") return "equipe";
  if (lower === "agente" || lower === "ai" || lower === "ia" || lower === "agent") return "agente";
  if (lower === "mcp") return "mcp";
  if (lower === "tags" || lower === "tag") return "tags";
  if (lower === "aparencia" || lower === "tema" || lower === "appearance") return "aparencia";
  return "perfil";
}

export function SettingsDialog({
  open,
  tab,
  onTabChange,
  onClose,
}: {
  open: boolean;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Fechar configurações"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configurações"
        className="relative flex h-[min(740px,calc(100dvh-1.5rem))] w-full max-w-[960px] flex-col overflow-hidden rounded-[28px] border border-line bg-elevated shadow-2xl md:flex-row"
      >
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3 py-3 md:w-[232px] md:flex-col md:overflow-y-auto md:border-r md:border-b-0 md:px-3 md:py-4">
          {GROUPS.map((group) => (
            <div key={group.label} className="md:mt-4 md:first:mt-0">
              <p className="hidden px-2.5 pb-1 text-[11px] font-medium text-faint md:block">
                {group.label}
              </p>
              <div className="flex gap-1 md:flex-col">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onTabChange(item.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm whitespace-nowrap transition-colors",
                        active
                          ? "bg-hover font-medium text-ink"
                          : "text-muted hover:bg-hover hover:text-ink",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-10 rounded-full p-1.5 text-faint hover:bg-hover hover:text-ink"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pr-14 pb-8 sm:px-8">
            <SettingsBody tab={tab} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AppearanceSettings() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-ink">Aparência</h2>
        <p className="mt-1 text-sm text-faint">Tema claro ou escuro em todo o ASA.</p>
      </div>
      <div className="grid max-w-md grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={cn(
            "rounded-xl border px-4 py-3 text-sm transition-colors",
            !isDark ? "border-ink bg-hover font-medium text-ink" : "border-line text-muted hover:bg-hover hover:text-ink",
          )}
        >
          Claro
        </button>
        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={cn(
            "rounded-xl border px-4 py-3 text-sm transition-colors",
            isDark ? "border-ink bg-hover font-medium text-ink" : "border-line text-muted hover:bg-hover hover:text-ink",
          )}
        >
          Escuro
        </button>
      </div>
    </section>
  );
}

function SettingsBody({ tab }: { tab: SettingsTab }) {
  const servers = usePrefs((state) => state.mcpServers);
  const current = useWorkspace((state) => state.user);
  const workspace = useWorkspace((state) => state.workspace);
  const workspaces = useWorkspace((state) => state.workspaces);

  const [workspaceName, setWorkspaceName] = useState(workspace?.name ?? "");
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceSaved, setWorkspaceSaved] = useState(false);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState<McpTransport>("http");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");

  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<WorkspaceMembership | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setWorkspaceName(workspace?.name ?? "");
  }, [workspace?.name]);

  return (
    <>
      {tab === "assinatura" && <BillingSettings />}
      {tab === "notificacoes" && <NotificationSettings />}
      {tab === "equipe" && <WorkspaceTeamSection />}
      {tab === "aparencia" && <AppearanceSettings />}

      {tab === "perfil" && (
        <div>
          {current ? (
            <section className="space-y-6">
              <div>
                <h2 className="text-sm font-medium text-ink">Conta</h2>
                <p className="mt-1 text-sm text-faint">
                  Nome, avatar, e-mail, telefone, senha e cargo da sua conta.
                </p>
              </div>
              <Card className="border-none">
                <MemberForm user={current} canEditAccess={false} requireCurrentPassword />
              </Card>
            </section>
          ) : (
            <p className="text-sm text-faint">Nenhum usuário logado.</p>
          )}
        </div>
      )}

      {tab === "workspace" && (
        <div className="space-y-10">
          {current?.access === "admin" && workspace ? (
            <section>
              <h2 className="text-sm font-medium text-ink">Espaço de trabalho</h2>
              <p className="mt-1 mb-4 text-sm text-faint">
                Nome e logo visíveis para quem faz parte deste espaço.
              </p>
              <div className="space-y-4">
                <WorkspaceLogoCard logo={workspace.logo} name={workspace.name} />
                <Card className="border-none">
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setWorkspaceSaved(false);
                      if (!workspaceName.trim()) {
                        setWorkspaceError("Informe o nome do espaço.");
                        return;
                      }
                      void renameWorkspace(workspaceName)
                        .then(() => {
                          setWorkspaceError("");
                          setWorkspaceSaved(true);
                        })
                        .catch(() => setWorkspaceError("Não foi possível salvar o nome."));
                    }}
                  >
                    <Input
                      label="Nome do espaço"
                      value={workspaceName}
                      onChange={(event) => setWorkspaceName(event.target.value)}
                    />
                    {workspaceError ? <p className="text-sm text-red-400">{workspaceError}</p> : null}
                    {workspaceSaved ? <p className="text-sm text-faint">Espaço atualizado.</p> : null}
                    <div className="flex justify-end">
                      <Button type="submit">Salvar</Button>
                    </div>
                  </form>
                </Card>
              </div>
            </section>
          ) : null}

          <CsvBackupCard />

          <section>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-medium text-ink">Meus espaços</h2>
                <p className="mt-1 text-sm text-faint">
                  Cada espaço tem a própria equipe, projetos e convites. Um administrador pode
                  excluir o espaço e tudo que está nele.
                </p>
              </div>
              <Button type="button" onClick={() => setCreating(true)} className="shrink-0">
                Novo espaço
              </Button>
            </div>
            {workspaces.length > 0 ? (
              <div className="space-y-3">
                {workspaces.map((item) => (
                  <Card key={item.id} className="border-none">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink">{item.name}</p>
                        <p className="mt-1 text-xs text-faint">
                          {item.id === workspace?.id
                            ? item.access === "admin"
                              ? "Espaço atual · administrador"
                              : "Espaço atual"
                            : item.access === "admin"
                              ? "Administrador"
                              : "Membro"}
                        </p>
                      </div>
                      {item.access === "admin" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError("");
                            setPendingDelete(item);
                          }}
                          className="shrink-0 text-xs text-faint hover:text-ink"
                        >
                          Excluir
                        </button>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      )}

      {tab === "agente" && <AgentSettingsCard />}

      {tab === "mcp" && (
        <div className="space-y-10">
          <section>
            <h2 className="text-sm font-medium text-ink">Servidores MCP</h2>
            <p className="mt-1 mb-4 text-sm text-faint">
              Conexões que o assistente usa. Ficam salvas neste navegador.
            </p>

            <Card className="mb-6 border-none">
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!name.trim() || !url.trim()) {
                    setError("Informe o nome e a URL do servidor.");
                    return;
                  }
                  if (!/^https?:\/\//i.test(url.trim())) {
                    setError("A URL precisa começar com http:// ou https://.");
                    return;
                  }
                  createMcpServer({ name, url, transport, apiKey });
                  setName("");
                  setUrl("");
                  setApiKey("");
                  setTransport("http");
                  setError("");
                }}
              >
                <p className="text-sm text-ink">Novo servidor MCP</p>
                <Input
                  label="Nome"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="ASA Assistente"
                />
                <Input
                  label="URL"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://mcp.exemplo.com"
                />
                <label className="flex flex-col gap-2 text-sm text-muted">
                  Transporte
                  <select
                    value={transport}
                    onChange={(event) => setTransport(event.target.value as McpTransport)}
                    className="h-11 rounded-2xl border border-line bg-base px-4 text-sm text-ink"
                  >
                    <option value="http">HTTP</option>
                    <option value="sse">SSE</option>
                  </select>
                </label>
                <Input
                  label="Chave de API"
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="Opcional"
                  autoComplete="off"
                />
                {error ? <p className="text-sm text-red-400">{error}</p> : null}
                <div className="flex justify-end">
                  <Button type="submit">Adicionar</Button>
                </div>
              </form>
            </Card>

            {servers.length === 0 ? (
              <p className="text-sm text-faint">Nenhum servidor configurado.</p>
            ) : (
              <div className="space-y-3">
                {servers.map((server) => (
                  <Card key={server.id} className="border-none">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-ink">{server.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-wide text-faint">
                          {server.transport} · {server.enabled ? "ativo" : "pausado"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateMcpServer(server.id, { enabled: !server.enabled })}
                        className="text-xs text-faint hover:text-ink"
                      >
                        {server.enabled ? "Pausar" : "Ativar"}
                      </button>
                    </div>
                    <div className="space-y-3">
                      <Input
                        label="URL"
                        value={server.url}
                        onChange={(event) => updateMcpServer(server.id, { url: event.target.value })}
                      />
                      <Input
                        label="Chave de API"
                        type="password"
                        value={server.apiKey}
                        onChange={(event) =>
                          updateMcpServer(server.id, { apiKey: event.target.value })
                        }
                        autoComplete="off"
                      />
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => deleteMcpServer(server.id)}
                        className="text-xs text-faint hover:text-ink"
                      >
                        Remover
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <ApiKeysCard />
        </div>
      )}

      {tab === "tags" && <TagsManager />}

      <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />

      <Dialog
        open={pendingDelete !== null}
        title="Excluir espaço"
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
      >
        <p className="text-sm leading-6 text-faint">
          {pendingDelete?.name} será excluído, junto com projetos, tarefas, mensagens e a equipe deste
          espaço.
        </p>
        {deleteError ? <p className="mt-3 text-sm text-red-400">{deleteError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={deleting}
            onClick={() => setPendingDelete(null)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={deleting || !pendingDelete}
            onClick={() => {
              if (!pendingDelete) return;
              setDeleting(true);
              setDeleteError("");
              void deleteWorkspace(pendingDelete.id).then((result) => {
                setDeleting(false);
                if (!result.ok) {
                  setDeleteError(result.error);
                  return;
                }
                setPendingDelete(null);
              });
            }}
          >
            Excluir
          </Button>
        </div>
      </Dialog>
    </>
  );
}
