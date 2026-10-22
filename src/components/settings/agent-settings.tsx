"use client";

import { AlertCircle, Check, Eye, EyeOff, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { request } from "@/lib/api/client";
import { AGENT_PRESETS, usePrefs } from "@/lib/prefs";
import type { AgentPreset } from "@/lib/types";

export function AgentSettingsCard() {
  const agent = usePrefs((state) => state.agent);
  const setAgent = usePrefs((state) => state.setAgent);

  const [preset, setPreset] = useState<AgentPreset>(agent.preset ?? "openai");
  const [baseUrl, setBaseUrl] = useState(agent.baseUrl || AGENT_PRESETS.openai.baseUrl);
  const [model, setModel] = useState(agent.model || AGENT_PRESETS.openai.model);
  const [apiKey, setApiKey] = useState(agent.apiKey || "");
  const [showKey, setShowKey] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: "idle" | "success" | "error";
    message?: string;
  }>({ status: "idle" });
  const [saved, setSaved] = useState(false);

  function handlePresetChange(next: AgentPreset) {
    setPreset(next);
    setTestResult({ status: "idle" });
    setSaved(false);
    if (next !== "custom") {
      const info = AGENT_PRESETS[next];
      setBaseUrl(info.baseUrl);
      setModel(info.model);
    }
  }

  function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setAgent({
      preset,
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      apiKey: apiKey.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handleTest() {
    if (!baseUrl.trim() || !apiKey.trim() || !model.trim()) {
      setTestResult({
        status: "error",
        message: "Preencha a URL base, a chave de API e o modelo para testar.",
      });
      return;
    }

    setTesting(true);
    setTestResult({ status: "idle" });
    try {
      const currentConfig = {
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim(),
      };
      // Salva imediatamente
      setAgent({ preset, ...currentConfig });

      const res = await request<{ ok: boolean; reply?: string }>("/ai/test", {
        method: "POST",
        body: JSON.stringify({ agent: currentConfig }),
      });

      if (res.ok) {
        setTestResult({
          status: "success",
          message: `Conexão bem-sucedida! Resposta do modelo: "${res.reply || "ok"}"`,
        });
      } else {
        setTestResult({
          status: "error",
          message: "O provedor não respondeu com sucesso.",
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Falha ao testar conexão com o agente.";
      setTestResult({
        status: "error",
        message,
      });
    } finally {
      setTesting(false);
    }
  }

  function handleClear() {
    setApiKey("");
    setAgent({ apiKey: "" });
    setTestResult({ status: "idle" });
    setSaved(false);
  }

  const isConfigured = Boolean(agent.apiKey.trim() && agent.baseUrl.trim());

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-ink">Agente de IA</h2>
            {isConfigured ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Conectado
              </span>
            ) : (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">
                Não configurado
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-faint">
            Conecte sua chave de API para habilitar o chat inteligente no Overview. O agente pode
            criar e atualizar tarefas, consultar prazos e gerenciar projetos de acordo com seu
            nível de acesso.
          </p>
        </div>
      </div>

      <Card className="border-none">
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted">
              Provedor / Modelo
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  { id: "openai", name: "OpenAI", sub: "GPT-4o mini / GPT-4o" },
                  { id: "xai", name: "Grok (xAI)", sub: "grok-4 / grok-beta" },
                  { id: "openrouter", name: "OpenRouter", sub: "Qualquer modelo" },
                  { id: "custom", name: "Própria API", sub: "URL customizada" },
                ] as const
              ).map((p) => {
                const active = preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePresetChange(p.id)}
                    className={`flex flex-col items-start rounded-2xl border p-3 text-left transition-colors ${
                      active
                        ? "border-ink bg-elevated text-ink"
                        : "border-line bg-base text-muted hover:border-muted hover:text-ink"
                    }`}
                  >
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="mt-0.5 text-[11px] text-faint">{p.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Input
                label="URL Base da API"
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setSaved(false);
                }}
                placeholder="https://api.openai.com/v1"
              />
              <p className="mt-1 text-[11px] text-faint">
                Compatível com OpenAI (ex: api.openai.com/v1, api.x.ai/v1, openrouter.ai/api/v1).
              </p>
            </div>

            <div>
              <Input
                label="Modelo"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  setSaved(false);
                }}
                placeholder="gpt-4o-mini, grok-4, etc."
              />
              <p className="mt-1 text-[11px] text-faint">
                Identificador do modelo que suporta chamadas de função (tool calling).
              </p>
            </div>
          </div>

          <div>
            <div className="relative">
              <Input
                label="Chave de API (API Key)"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setSaved(false);
                  setTestResult({ status: "idle" });
                }}
                placeholder="sk-..."
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 bottom-3 text-faint hover:text-ink"
                tabIndex={-1}
                aria-label={showKey ? "Ocultar chave" : "Mostrar chave"}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-faint">
              A chave fica armazenada com segurança apenas neste navegador e nunca é exposta para
              outros usuários.
            </p>
          </div>

          {testResult.status === "success" && (
            <div className="flex items-start gap-2.5 rounded-2xl bg-emerald-500/10 p-3.5 text-xs text-emerald-400">
              <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
              <div className="min-w-0">
                <p className="font-medium">Tudo certo com a sua API!</p>
                <p className="mt-0.5 text-emerald-400/80">{testResult.message}</p>
              </div>
            </div>
          )}

          {testResult.status === "error" && (
            <div className="flex items-start gap-2.5 rounded-2xl bg-red-500/10 p-3.5 text-xs text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
              <div className="min-w-0">
                <p className="font-medium">Erro ao conectar com o provedor</p>
                <p className="mt-0.5 text-red-400/80">{testResult.message}</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={testing || !apiKey.trim()}
                onClick={handleTest}
                className="gap-2"
              >
                {testing ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    <span>Testando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Testar conexão</span>
                  </>
                )}
              </Button>
              {apiKey.trim() ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-full px-3 py-1.5 text-xs text-faint hover:text-red-400 transition-colors"
                >
                  Desconectar
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              {saved ? (
                <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                  <Check className="h-3.5 w-3.5" /> Salvo com sucesso
                </span>
              ) : null}
              <Button type="submit">Salvar configurações</Button>
            </div>
          </div>
        </form>
      </Card>

      <div className="rounded-2xl border border-line-subtle bg-elevated/50 p-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
          Como funciona o agente?
        </h3>
        <ul className="mt-2.5 space-y-2 text-xs text-faint">
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1 w-1 rounded-full bg-ink shrink-0" />
            <span>
              <strong>Criação autônoma:</strong> Peça diretamente no chat do Overview:{" "}
              <em>"Crie uma tarefa para revisar a entrega na sexta com prioridade alta"</em>.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1 w-1 rounded-full bg-ink shrink-0" />
            <span>
              <strong>Consulta em tempo real:</strong> O agente pesquisa seus projetos, equipe e
              prazos para responder com precisão antes de executar ações.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1 w-1 rounded-full bg-ink shrink-0" />
            <span>
              <strong>Permissões seguras:</strong> O agente respeita estritamente o seu nível de
              acesso (administrador ou membro) e não executa exclusões destrutivas por chat.
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}
