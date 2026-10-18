"use client";

import { useEffect, useState } from "react";
import { CreateWorkspaceDialog } from "@/components/layout/create-workspace-dialog";
import { MemberForm } from "@/components/team/member-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiKeysCard } from "@/components/settings/api-keys";
import { createMcpServer, deleteMcpServer, deleteWorkspace, renameWorkspace, updateMcpServer } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import type { McpTransport, WorkspaceMembership } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";

export default function SettingsPage() {
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
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="mb-8 text-2xl font-medium tracking-tight text-ink">Configurações</h1>
      <section className="mb-10">
        <h2 className="text-sm text-ink">Espaços</h2>
        <p className="mt-1 mb-4 text-sm text-faint">
          Cada espaço tem a própria equipe, projetos e convites. Um administrador pode excluir o
          espaço e tudo que está nele.
        </p>
        {workspaces.length > 0 ? (
          <div className="mb-4 space-y-3">
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
        <Button type="button" onClick={() => setCreating(true)}>
          Novo espaço
        </Button>
      </section>
      {current?.access === "admin" && workspace ? (
        <section className="mb-10">
          <h2 className="text-sm text-ink">Espaço de trabalho</h2>
          <p className="mt-1 mb-4 text-sm text-faint">
            Nome visível para quem faz parte deste espaço.
          </p>
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
        </section>
      ) : null}
      {current ? (
        <section className="mb-10">
          <h2 className="text-sm text-ink">Perfil</h2>
          <p className="mt-1 mb-4 text-sm text-faint">
            Nome, avatar, e-mail, senha e cargo da sua conta.
          </p>
          <Card className="border-none">
            <MemberForm user={current} canEditAccess={false} requireCurrentPassword />
          </Card>
        </section>
      ) : null}
      <h2 className="mb-2 text-sm text-ink">Servidores MCP</h2>
      <p className="mb-4 text-sm text-faint">
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
      <ApiKeysCard />
      <CreateWorkspaceDialog open={creating} onClose={() => setCreating(false)} />
      <Dialog
        open={pendingDelete !== null}
        title="Excluir espaço"
        onClose={() => {
          if (!deleting) setPendingDelete(null);
        }}
      >
        <p className="text-sm leading-6 text-faint">
          {pendingDelete?.name} será excluído, junto com projetos, tarefas, mensagens e a equipe
          deste espaço.
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
