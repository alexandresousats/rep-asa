"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Cpu, CreditCard, Hash, Sparkles, User, Users } from "lucide-react";
import { CreateWorkspaceDialog } from "@/components/layout/create-workspace-dialog";
import { MemberForm } from "@/components/team/member-dialog";
import { WorkspaceTeamSection } from "@/components/team/workspace-team-section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AgentSettingsCard } from "@/components/settings/agent-settings";
import { BillingSettings } from "@/components/settings/billing-card";
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

type SettingsTab = "perfil" | "assinatura" | "equipe" | "workspace" | "agente" | "mcp" | "tags";

const TABS: { id: SettingsTab; label: string; icon: typeof User }[] = [
  { id: "perfil", label: "Perfil", icon: User },
  { id: "assinatura", label: "Assinatura", icon: CreditCard },
  { id: "equipe", label: "Equipe", icon: Users },
  { id: "workspace", label: "Espaço de trabalho", icon: Building2 },
  { id: "agente", label: "Agente de IA", icon: Sparkles },
  { id: "mcp", label: "MCP", icon: Cpu },
  { id: "tags", label: "Tags", icon: Hash },
];

function normalizeTab(param: string | null): SettingsTab {
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
  if (lower === "assinatura" || lower === "billing" || lower === "plano") return "assinatura";
  if (lower === "equipe" || lower === "team") return "equipe";
  if (lower === "agente" || lower === "ai" || lower === "ia" || lower === "agent") {
    return "agente";
  }
  if (lower === "mcp") return "mcp";
  if (lower === "tags" || lower === "tag") return "tags";
  return "perfil";
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10" />}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = normalizeTab(searchParams.get("tab"));

  const setTab = (tab: SettingsTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/configuracoes?${params.toString()}`, { scroll: false });
  };

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
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-6 text-2xl font-medium tracking-tight text-ink">Configurações</h1>

      <div className="mb-8 flex items-center gap-1.5 overflow-x-auto border-b border-line pb-3">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTab(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                active
                  ? "bg-active text-ink shadow-xs"
                  : "text-muted hover:bg-hover hover:text-ink",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "assinatura" && <BillingSettings />}

      {activeTab === "equipe" && <WorkspaceTeamSection />}

      {activeTab === "perfil" && (
        <div>
          {current ? (
            <section className="space-y-6">
              <div>
                <h2 className="text-sm font-medium text-ink">Perfil</h2>
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

      {activeTab === "workspace" && (
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
                  {workspaceError ? (
                    <p className="text-sm text-red-400">{workspaceError}</p>
                  ) : null}
                  {workspaceSaved ? (
                    <p className="text-sm text-faint">Espaço atualizado.</p>
                  ) : null}
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

      {activeTab === "agente" && <AgentSettingsCard />}

      {activeTab === "mcp" && (
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
                        onClick={() =>
                          updateMcpServer(server.id, { enabled: !server.enabled })
                        }
                        className="text-xs text-faint hover:text-ink"
                      >
                        {server.enabled ? "Pausar" : "Ativar"}
                      </button>
                    </div>
                    <div className="space-y-3">
                      <Input
                        label="URL"
                        value={server.url}
                        onChange={(event) =>
                          updateMcpServer(server.id, { url: event.target.value })
                        }
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

      {activeTab === "tags" && <TagsManager />}

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
    </div>
  );
}
