"use client";

import {
  Download,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useRef, useState } from "react";
import { removeAttachment, uploadAttachment } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { TaskAttachment } from "@/lib/types";

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
    return <FileImage className="h-4 w-4 text-blue-500 shrink-0" />;
  }

  if (
    mime === "application/pdf" ||
    ext === "pdf"
  ) {
    return <FileText className="h-4 w-4 text-red-500 shrink-0" />;
  }

  if (
    ["zip", "tar", "gz", "7z", "rar"].includes(ext)
  ) {
    return <FileArchive className="h-4 w-4 text-amber-500 shrink-0" />;
  }

  if (
    ["ts", "tsx", "js", "jsx", "json", "html", "css", "py", "sql", "sh"].includes(ext)
  ) {
    return <FileCode className="h-4 w-4 text-emerald-500 shrink-0" />;
  }

  return <File className="h-4 w-4 text-muted shrink-0" />;
}

export function TaskAttachments({
  taskId,
  attachments = [],
  canWrite,
}: {
  taskId: string;
  attachments?: TaskAttachment[];
  canWrite: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUploadFiles(files: FileList | File[]) {
    if (!files || files.length === 0 || !canWrite) return;
    setIsUploading(true);
    setUploadError("");

    try {
      for (const file of Array.from(files)) {
        await uploadAttachment(taskId, file);
      }
    } catch {
      setUploadError("Não foi possível enviar um ou mais arquivos.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDelete(attachmentId: string) {
    if (!canWrite || deletingId) return;
    setDeletingId(attachmentId);
    try {
      await removeAttachment(taskId, attachmentId);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-faint">
          Arquivos {attachments.length > 0 ? `(${attachments.length})` : ""}
        </p>
      </div>

      {/* Attachments List */}
      {attachments.length > 0 ? (
        <div className="grid grid-cols-1 gap-2">
          {attachments.map((file) => (
            <div
              key={file.id}
              className="group flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-base/50 p-2.5 transition-all duration-150 hover:border-line hover:bg-hover/60"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                {getFileIcon(file.name, file.mime)}
                <div className="min-w-0 flex-1">
                  <a
                    href={`/api/tasks/${taskId}/attachments/${file.id}`}
                    download={file.name}
                    className="block truncate text-xs font-medium text-ink transition-colors hover:underline"
                    title={file.name}
                  >
                    {file.name}
                  </a>
                  <span className="text-[10px] text-faint">{formatBytes(file.size)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <a
                  href={`/api/tasks/${taskId}/attachments/${file.id}`}
                  download={file.name}
                  aria-label={`Baixar ${file.name}`}
                  title="Baixar arquivo"
                  className="rounded-lg p-1 text-faint transition-colors hover:bg-hover hover:text-ink"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>

                {canWrite ? (
                  <button
                    type="button"
                    disabled={deletingId === file.id}
                    onClick={() => void handleDelete(file.id)}
                    aria-label={`Remover ${file.name}`}
                    title="Remover arquivo"
                    className="rounded-lg p-1 text-faint transition-colors hover:bg-hover hover:text-red-500 disabled:opacity-50"
                  >
                    {deletingId === file.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Drag & Drop Zone */}
      {canWrite ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isDragging) setIsDragging(true);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // Check if leaving the current target
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              void handleUploadFiles(e.dataTransfer.files);
            }
          }}
          onClick={() => {
            if (!isUploading) {
              fileInputRef.current?.click();
            }
          }}
          className={cn(
            "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center transition-all duration-200 cursor-pointer",
            isDragging
              ? "border-ink bg-active/40 scale-[1.01] shadow-md ring-2 ring-ink/20"
              : "border-line/70 bg-base/30 hover:border-line hover:bg-hover/40",
            isUploading && "pointer-events-none opacity-70",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) {
                void handleUploadFiles(e.target.files);
              }
            }}
          />

          {isUploading ? (
            <div className="flex flex-col items-center gap-2 py-1">
              <Loader2 className="h-6 w-6 animate-spin text-ink" />
              <p className="text-xs font-medium text-ink">Enviando arquivos...</p>
            </div>
          ) : isDragging ? (
            <div className="flex flex-col items-center gap-1.5 py-1">
              <UploadCloud className="h-7 w-7 text-ink animate-bounce" />
              <p className="text-xs font-medium text-ink">Solte os arquivos aqui</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-base border border-line text-muted">
                <UploadCloud className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-medium text-ink">
                  Arraste e solte arquivos aqui ou{" "}
                  <span className="underline underline-offset-2 hover:text-ink">
                    escolha do computador
                  </span>
                </p>
                <p className="mt-0.5 text-[10px] text-faint">
                  Imagens, PDFs, documentos e outros formatos
                </p>
              </div>
            </div>
          )}
        </div>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-faint">Nenhum arquivo anexado.</p>
      ) : null}

      {uploadError ? (
        <p className="text-xs text-red-400">{uploadError}</p>
      ) : null}
    </div>
  );
}
