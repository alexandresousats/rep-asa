"use client";

import {
  Calendar,
  Check,
  FileArchive,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Film,
  Layers,
  Link2,
  Loader2,
  Plus,
  Send,
  Smartphone,
  Square,
  UploadCloud,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createTask, uploadAttachment } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { DemandFormat, Task } from "@/lib/types";
import { useWorkspace } from "@/lib/workspace";

export const FORMAT_OPTIONS: {
  id: DemandFormat;
  label: string;
  tagName: string;
  icon: typeof Square;
  color: string;
  bgLight: string;
  borderColor: string;
  desc: string;
}[] = [
  {
    id: "card",
    label: "Card / Post",
    tagName: "Card",
    icon: Square,
    color: "text-sky-400",
    bgLight: "bg-sky-500/10 hover:bg-sky-500/20",
    borderColor: "border-sky-500/40",
    desc: "Post estático 1:1 ou 4:5",
  },
  {
    id: "carrossel",
    label: "Carrossel",
    tagName: "Carrossel",
    icon: Layers,
    color: "text-indigo-400",
    bgLight: "bg-indigo-500/10 hover:bg-indigo-500/20",
    borderColor: "border-indigo-500/40",
    desc: "Sequência de slides educativos ou de venda",
  },
  {
    id: "video_longo",
    label: "Vídeo Longo",
    tagName: "Vídeo Longo",
    icon: Film,
    color: "text-amber-400",
    bgLight: "bg-amber-500/10 hover:bg-amber-500/20",
    borderColor: "border-amber-500/40",
    desc: "YouTube, aula, entrevista ou VSL",
  },
  {
    id: "reels",
    label: "Reels / TikTok",
    tagName: "Reels",
    icon: Smartphone,
    color: "text-pink-400",
    bgLight: "bg-pink-500/10 hover:bg-pink-500/20",
    borderColor: "border-pink-500/40",
    desc: "Vídeo vertical dinâmico 9:16",
  },
];

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(filename: string, mime?: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (
    mime?.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)
  ) {
    return <FileImage className="h-4 w-4 text-sky-400 shrink-0" />;
  }
  if (
    mime?.startsWith("video/") ||
    ["mp4", "mov", "avi", "mkv", "webm"].includes(ext)
  ) {
    return <FileVideo className="h-4 w-4 text-pink-400 shrink-0" />;
  }
  if (mime === "application/pdf" || ext === "pdf") {
    return <FileText className="h-4 w-4 text-red-400 shrink-0" />;
  }
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return <FileArchive className="h-4 w-4 text-amber-400 shrink-0" />;
  }
  return <FileCode className="h-4 w-4 text-muted shrink-0" />;
}

export function CreateDemandDialog({
  open,
  onClose,
  defaultProjectId,
  onDemandCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultProjectId?: string;
  onDemandCreated?: (task: Task) => void;
}) {
  const projects = useWorkspace((state) => state.projects);
  const tags = useWorkspace((state) => state.tags);
  const user = useWorkspace((state) => state.user);

  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(() => defaultProjectId ?? projects[0]?.id ?? "");
  const [selectedFormat, setSelectedFormat] = useState<DemandFormat>("reels");
  const [dueDate, setDueDate] = useState("");
  const [referenceUrls, setReferenceUrls] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-pick first project if none selected
  const activeProjectId = projectId || defaultProjectId || projects[0]?.id || "";
  const currentProject = projects.find((p) => p.id === activeProjectId);

  function resetForm() {
    setTitle("");
    setSelectedFormat("reels");
    setDueDate("");
    setReferenceUrls("");
    setDescription("");
    setFiles([]);
    setError("");
  }

  function handleClose() {
    if (isSubmitting) return;
    resetForm();
    onClose();
  }

  function handleAddFiles(newFiles: FileList | File[]) {
    const list = Array.from(newFiles);
    setFiles((prev) => [...prev, ...list]);
  }

  function handleRemoveFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Por favor, preencha o assunto da demanda.");
      return;
    }
    if (!activeProjectId) {
      setError("Selecione um projeto para a demanda.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // Find corresponding tag for the explicit format
      const formatConfig = FORMAT_OPTIONS.find((f) => f.id === selectedFormat);
      const tagMatches = tags.filter((t) => {
        const tname = t.name.trim().toLowerCase();
        return (
          tname === formatConfig?.tagName.toLowerCase() ||
          tname === selectedFormat.toLowerCase() ||
          (selectedFormat === "video_longo" && (tname.includes("video") || tname.includes("vídeo")))
        );
      });
      const tagIds = tagMatches.map((t) => t.id);

      // Section: usually "Demandas" or project's first section
      const sectionName =
        currentProject?.sections?.find(
          (s) => s.toLowerCase().includes("demanda") || s.toLowerCase().includes("briefing") || s.toLowerCase().includes("a fazer"),
        ) ??
        currentProject?.sections?.[0] ??
        "Geral";

      const created = await createTask({
        projectId: activeProjectId,
        title: title.trim(),
        description: description.trim(),
        dueDate: dueDate || null,
        isDemand: true,
        demandFormat: selectedFormat,
        referenceUrls: referenceUrls.trim() || null,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
        section: sectionName,
      });

      // Upload files if any
      if (files.length > 0) {
        for (const file of files) {
          try {
            await uploadAttachment(created.id, file);
          } catch {
            // continue with remaining files
          }
        }
      }

      onDemandCreated?.(created);
      handleClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Não foi possível enviar a demanda. Tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} title="Solicitar Nova Demanda" onClose={handleClose}>
      <p className="mb-4 text-xs text-faint">
        Preencha os detalhes da sua demanda criativa com referências e prazo para a equipe produzir.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Assunto */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Assunto da demanda <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="Ex: Reels explicativo sobre o produto X"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-11 w-full rounded-2xl border border-line bg-base px-4 text-sm text-ink outline-none transition-all placeholder:text-faint focus:border-ink"
          />
        </div>

        {/* Projeto se tiver mais de um */}
        {projects.length > 1 ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              Projeto / Marca
            </label>
            <select
              value={activeProjectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-11 w-full rounded-2xl border border-line bg-base px-4 text-sm text-ink outline-none"
            >
              {projects.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {/* Tags Explícitas de Formato */}
        <div>
          <label className="mb-2 block text-xs font-medium text-muted">
            Formato do conteúdo <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FORMAT_OPTIONS.map((item) => {
              const active = selectedFormat === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedFormat(item.id)}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-center transition-all",
                    active
                      ? `${item.borderColor} ${item.bgLight} ring-1 ring-offset-0 ring-ink/20 shadow-sm`
                      : "border-line bg-base hover:bg-hover text-muted hover:text-ink",
                  )}
                >
                  {active ? (
                    <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-base">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  ) : null}
                  <Icon className={cn("h-5 w-5", active ? item.color : "text-faint")} />
                  <span className="text-xs font-medium leading-tight text-ink">{item.label}</span>
                  <span className="text-[10px] text-faint line-clamp-1">{item.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Data Prazo */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Data prazo desejada
          </label>
          <div className="relative">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-11 w-full rounded-2xl border border-line bg-base px-4 text-sm text-ink outline-none transition-all focus:border-ink"
            />
          </div>
        </div>

        {/* Links de Referências */}
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Link2 className="h-3.5 w-3.5 text-sky-400" />
            Links de referências (Instagram, TikTok, YouTube, Drive, Behance)
          </label>
          <textarea
            rows={2}
            placeholder="Cole aqui os links de referências, inspirações ou arquivos na nuvem (um por linha)"
            value={referenceUrls}
            onChange={(e) => setReferenceUrls(e.target.value)}
            className="w-full rounded-2xl border border-line bg-base p-3 text-sm text-ink outline-none transition-all placeholder:text-faint focus:border-ink"
          />
        </div>

        {/* Briefing / Descrição */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Briefing / O que deve conter
          </label>
          <textarea
            rows={3}
            placeholder="Descreva detalhes, textos, direcionamentos criativos ou pontos importantes para este material..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-2xl border border-line bg-base p-3 text-sm text-ink outline-none transition-all placeholder:text-faint focus:border-ink"
          />
        </div>

        {/* Upload de Imagens e Vídeos */}
        <div>
          <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted">
            <span>Imagens e vídeos de referência ({files.length})</span>
            {files.length > 0 ? (
              <button
                type="button"
                onClick={() => setFiles([])}
                className="text-[11px] text-faint hover:text-ink"
              >
                Limpar arquivos
              </button>
            ) : null}
          </label>

          {/* Files List */}
          {files.length > 0 ? (
            <div className="mb-2 max-h-36 space-y-1.5 overflow-y-auto pr-1">
              {files.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line/60 bg-base p-2 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {getFileIcon(file.name, file.type)}
                    <span className="truncate text-ink">{file.name}</span>
                    <span className="text-[10px] text-faint shrink-0">
                      {formatBytes(file.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(idx)}
                    className="rounded p-1 text-faint hover:bg-hover hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files?.length) {
                handleAddFiles(e.dataTransfer.files);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 text-center cursor-pointer transition-colors",
              isDragging
                ? "border-ink bg-active/40"
                : "border-line hover:border-line-subtle hover:bg-hover/40",
            )}
          >
            <UploadCloud className="mb-1.5 h-5 w-5 text-faint" />
            <p className="text-xs text-muted">
              Arraste imagens ou vídeos aqui ou <span className="text-ink underline">clique para selecionar</span>
            </p>
            <p className="mt-0.5 text-[10px] text-faint">
              JPG, PNG, MP4, MOV, PDF, etc.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  handleAddFiles(e.target.files);
                }
              }}
            />
          </div>
        </div>

        {error ? <p className="text-xs text-red-400">{error}</p> : null}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting} className="gap-2">
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando Demanda...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Enviar Solicitação
              </>
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
