"use client";

import { useState } from "react";
import { MemberForm } from "@/components/team/member-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiKeysCard } from "@/components/settings/api-keys";
import { createMcpServer, deleteMcpServer, updateMcpServer } from "@/lib/api";
import { usePrefs } from "@/lib/prefs";
import type { McpTransport } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";

export default function SettingsPage() {
  const servers = usePrefs((state) => state.mcpServers);
  const current = useWorkspace((state) => state.user);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState<McpTransport>("http");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <h1 className="mb-8 text-2xl font-medium tracking-tight text-ink">Configurações</h1>
      {current?.master ? (
        <section className="mb-10">
          <h2 className="text-sm text-ink">Administrador</h2>
          <p className="mt-1 mb-4 text-sm text-faint">
            Nome, avatar, e-mail, senha e cargo da conta principal.
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
    </div>
  );
}
