"use client";

import {
  Check,
  Copy,
  ExternalLink,
  Film,
  Layers,
  Link2,
  Loader2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { generateDemandLink } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAccess, useWorkspace } from "@/lib/workspace";

export function ShareDemandLinkDialog({
  open,
  onClose,
  defaultProjectId,
}: {
  open: boolean;
  onClose: () => void;
  defaultProjectId?: string;
}) {
  const projects = useWorkspace((state) => state.projects);
  const workspace = useWorkspace((state) => state.workspace);
  const { user, isAdmin, canWrite } = useAccess();

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    () => defaultProjectId || projects[0]?.id || "",
  );
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (defaultProjectId) {
      setSelectedProjectId(defaultProjectId);
    } else if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [defaultProjectId, projects, selectedProjectId]);

  useEffect(() => {
    if (!open || !selectedProjectId) return;
    let cancelled = false;

    async function loadLink() {
      setLoading(true);
      setError("");
      try {
        const res = await generateDemandLink(selectedProjectId);
        if (!cancelled && res.token) {
          setToken(res.token);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Não foi possível gerar o link de demanda.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadLink();

    return () => {
      cancelled = true;
    };
  }, [open, selectedProjectId]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = token ? `${origin}/solicitar-demanda?token=${token}` : "";

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  function handleCopy() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function handleOpenChat() {
    if (!shareUrl) return;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open={open} onClose={onClose} title="Link de Solicitação de Demanda">
      <div className="space-y-5">
        {/* Descrição & Selo de Verificação */}
        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs text-ink">
          <div className="flex items-center gap-2 text-sky-400 font-medium text-sm">
            <ShieldCheck className="h-4 w-4" />
            <span>Link Verificado pelo Administrador</span>
          </div>
          <p className="mt-1.5 text-faint leading-relaxed">
            Envie este link seguro para seu cliente ou parceiro. Ele abrirá o <strong>chat do agente de IA</strong>,
            que já sabe de qual projeto se trata, pergunta o assunto logo de início e coleta dados, textos, imagens e vídeos.
          </p>
        </div>

        {/* Seleção do Projeto */}
        <div>
          <label className="block text-xs font-medium text-faint mb-2">
            Projeto da Demanda
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 max-h-48 overflow-y-auto pr-1">
            {projects.map((p) => {
              const active = p.id === selectedProjectId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProjectId(p.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border p-2.5 text-left text-xs transition-all",
                    active
                      ? "border-sky-500 bg-sky-500/10 text-ink shadow-2xs"
                      : "border-line bg-elevated/60 text-muted hover:border-line-subtle hover:text-ink",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color || "#38bdf8" }}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block font-medium truncate">{p.name}</span>
                    {p.description && (
                      <span className="block text-[10px] text-faint truncate">
                        {p.description}
                      </span>
                    )}
                  </div>
                  {active && <Check className="h-3.5 w-3.5 text-sky-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Link Gerado com Ações */}
        <div>
          <label className="block text-xs font-medium text-faint mb-2">
            Link Verificado para Compartilhamento
          </label>

          {loading ? (
            <div className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-elevated text-xs text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
              <span>Gerando link assinado...</span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="h-10 flex-1 rounded-xl border border-line bg-elevated px-3 text-xs font-mono text-ink outline-none select-all"
                />
                <Button
                  type="button"
                  onClick={handleCopy}
                  className={cn(
                    "h-10 gap-1.5 px-4 text-xs font-medium transition-all shadow-xs",
                    copied
                      ? "bg-emerald-600 text-white"
                      : "bg-sky-500 text-white hover:bg-sky-600",
                  )}
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copiar Link</span>
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-faint">
                <span>
                  Admin verificador: <strong className="text-ink">{user?.name}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleOpenChat}
                  className="flex items-center gap-1 text-sky-400 hover:text-sky-300 font-medium hover:underline"
                >
                  <span>Testar chat do agente</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Recursos Inclusos no Chat do Agente */}
        <div className="rounded-2xl border border-line bg-elevated/40 p-3.5">
          <span className="text-[11px] font-semibold text-faint uppercase tracking-wider block mb-2.5">
            O que o cliente terá no chat:
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted">
            <div className="flex items-center gap-2 rounded-lg bg-base/50 p-2">
              <Square className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              <span>Cards / Posts estáticos</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-base/50 p-2">
              <Layers className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span>Carrosséis de slides</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-base/50 p-2">
              <Film className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>Vídeos Longos / YouTube</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-base/50 p-2">
              <Smartphone className="h-3.5 w-3.5 text-pink-400 shrink-0" />
              <span>Reels / TikTok (9:16)</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-faint">
            O agente recebe textos, dados técnicos, documentos (PDFs), imagens, vídeos e notas de voz.
          </p>
        </div>

        {/* Rodapé do Modal */}
        <div className="flex justify-end gap-2 pt-2 border-t border-line-subtle">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={handleCopy}
            className="gap-1.5 bg-gradient-to-r from-sky-500 to-indigo-600 text-white"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Copiar e Enviar</span>
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
