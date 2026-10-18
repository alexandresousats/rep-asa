"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createApiKey, deleteApiKey, listApiKeys } from "@/lib/api";
import type { ApiKeyInfo } from "@/lib/types";

export function ApiKeysCard() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");

  async function reload() {
    setKeys(await listApiKeys());
  }

  useEffect(() => {
    setMcpUrl(`${window.location.origin}/mcp`);
    void reload().catch(() => setError("Não foi possível carregar as chaves."));
  }, []);

  return (
    <section className="mt-10">
      <h2 className="text-sm text-ink">Chaves para Grok e ChatGPT</h2>
      <p className="mt-1 mb-4 text-sm text-faint">
        Cada chave age com o seu nível de acesso. No conector MCP, use a URL{" "}
        <span className="text-ink">{mcpUrl}</span> e o segredo como Bearer.
      </p>
      <Card className="mb-4 border-none">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void createApiKey(name)
              .then((created) => {
                setSecret(created.secret ?? "");
                setName("");
                setError("");
                return reload();
              })
              .catch((reason: Error) => setError(reason.message));
          }}
        >
          <Input
            label="Nome da chave"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="ChatGPT"
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex justify-end">
            <Button type="submit">Gerar chave</Button>
          </div>
        </form>
        {secret ? (
          <p className="mt-4 rounded-2xl bg-base px-4 py-3 text-sm text-ink">
            Copie agora. Ela não aparece de novo: <span className="break-all">{secret}</span>
          </p>
        ) : null}
      </Card>
      {keys.length === 0 ? (
        <p className="text-sm text-faint">Nenhuma chave gerada.</p>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <Card key={key.id} className="flex items-center justify-between border-none">
              <div>
                <p className="text-sm text-ink">{key.name}</p>
                <p className="mt-1 text-xs text-faint">{key.prefix}…</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void deleteApiKey(key.id).then(reload);
                }}
                className="text-xs text-faint hover:text-ink"
              >
                Revogar
              </button>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
