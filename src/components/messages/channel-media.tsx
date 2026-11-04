"use client";

import { Download, FileText, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useState } from "react";
import { channelFileUrl } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { ChannelFile } from "@/lib/types";

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

const KIND_LABEL: Record<string, string> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
};

function usePlayback() {
  const [node, setNode] = useState<HTMLMediaElement | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!node) return;
    function sync() {
      if (!node) return;
      setTime(node.currentTime || 0);
      setDuration(Number.isFinite(node.duration) ? node.duration : 0);
      setPlaying(!node.paused);
      setMuted(node.muted);
    }
    const events = ["timeupdate", "loadedmetadata", "durationchange", "play", "pause", "ended", "volumechange"] as const;
    for (const event of events) node.addEventListener(event, sync);
    sync();
    return () => {
      for (const event of events) node.removeEventListener(event, sync);
    };
  }, [node]);

  return {
    setNode,
    time,
    duration,
    playing,
    muted,
    toggle() {
      if (!node) return;
      if (node.paused) void node.play();
      else node.pause();
    },
    seek(value: number) {
      if (!node) return;
      node.currentTime = value;
      setTime(value);
    },
    toggleMute() {
      if (!node) return;
      node.muted = !node.muted;
    },
  };
}

function Seek({
  time,
  duration,
  onSeek,
  light,
}: {
  time: number;
  duration: number;
  onSeek: (value: number) => void;
  light?: boolean;
}) {
  return (
    <input
      type="range"
      min={0}
      max={duration || 0}
      step={0.1}
      value={duration ? Math.min(time, duration) : 0}
      aria-label="Posição"
      aria-valuetext={clock(time)}
      onChange={(event) => onSeek(Number(event.target.value))}
      className={cn(
        "h-1 w-full cursor-pointer appearance-none rounded-full",
        light ? "bg-white/20 accent-white" : "bg-line accent-ink",
      )}
    />
  );
}

function AudioPiece({ src, name, size }: { src: string; name: string; size: number }) {
  const play = usePlayback();
  return (
    <figure className="rounded-xl border border-line bg-elevated px-3 py-2.5">
      <figcaption className="mb-2 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-ink">{name}</span>
        <span className="shrink-0 text-[11px] text-faint">{formatBytes(size)}</span>
      </figcaption>
      <audio ref={play.setNode} src={src} preload="metadata" className="hidden" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={play.toggle}
          aria-label={play.playing ? "Pausar" : "Reproduzir"}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-[color:var(--bg-base)]"
        >
          {play.playing ? (
            <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />
          ) : (
            <Play className="h-3.5 w-3.5 translate-x-px" strokeWidth={1.75} />
          )}
        </button>
        <span className="w-9 shrink-0 text-[11px] tabular-nums text-faint">{clock(play.time)}</span>
        <Seek time={play.time} duration={play.duration} onSeek={play.seek} />
        <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-faint">{clock(play.duration)}</span>
      </div>
    </figure>
  );
}

function VideoPiece({
  src,
  name,
  size,
  large,
}: {
  src: string;
  name: string;
  size: number;
  large?: boolean;
}) {
  const play = usePlayback();
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-[#0d0c0c] text-white">
      <div className="relative">
        <video
          ref={play.setNode}
          src={src}
          preload="metadata"
          playsInline
          onClick={play.toggle}
          className={cn("w-full bg-[#0d0c0c]", large ? "max-h-[72vh]" : "max-h-80")}
        />
        {play.playing ? null : (
          <button
            type="button"
            onClick={play.toggle}
            aria-label="Reproduzir"
            className="absolute top-1/2 left-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black"
          >
            <Play className="h-5 w-5 translate-x-px" strokeWidth={1.75} />
          </button>
        )}
      </div>
      <figcaption className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={play.toggle}
          aria-label={play.playing ? "Pausar" : "Reproduzir"}
          className="shrink-0 text-white"
        >
          {play.playing ? <Pause className="h-4 w-4" strokeWidth={1.75} /> : <Play className="h-4 w-4" strokeWidth={1.75} />}
        </button>
        <span className="w-9 shrink-0 text-[11px] tabular-nums text-white/60">{clock(play.time)}</span>
        <Seek time={play.time} duration={play.duration} onSeek={play.seek} light />
        <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/60">{clock(play.duration)}</span>
        <button
          type="button"
          onClick={play.toggleMute}
          aria-label={play.muted ? "Ativar som" : "Silenciar"}
          className="shrink-0 text-white/80"
        >
          {play.muted ? <VolumeX className="h-4 w-4" strokeWidth={1.75} /> : <Volume2 className="h-4 w-4" strokeWidth={1.75} />}
        </button>
        <span className="hidden min-w-0 truncate text-[11px] text-white/50 sm:block">{name}</span>
        <span className="shrink-0 text-[11px] text-white/40">{formatBytes(size)}</span>
      </figcaption>
    </figure>
  );
}

export function ChannelFileList({
  channelId,
  files,
  embedded = false,
}: {
  channelId: string;
  files: ChannelFile[];
  embedded?: boolean;
}) {
  const [open, setOpen] = useState<ChannelFile | null>(null);
  if (files.length === 0) return null;
  const images = files.filter((file) => file.kind === "image");
  const videos = files.filter((file) => file.kind === "video");
  const audios = files.filter((file) => file.kind === "audio");
  const documents = files.filter((file) => file.kind === "document");

  return (
    <div className={cn(embedded ? "mt-1 space-y-1" : "mt-2 max-w-xl space-y-2")}>
      {images.length > 0 ? (
        <div className={cn("flex flex-wrap gap-2", images.length > 1 && "max-w-lg")}>
          {images.map((file) => (
            <button
              key={file.id}
              type="button"
              onClick={() => setOpen(file)}
              aria-label={`Abrir ${file.name}`}
              className={cn(
                "overflow-hidden bg-[#0d0c0c]",
                embedded ? "rounded-lg" : "rounded-xl border border-line",
              )}
            >
              <img
                src={channelFileUrl(channelId, file.id)}
                alt=""
                referrerPolicy="no-referrer"
                className={cn(
                  "max-w-full object-contain",
                  embedded ? "block max-h-80 w-full" : images.length > 1 ? "max-h-40 w-auto" : "max-h-72 w-auto",
                )}
              />
            </button>
          ))}
        </div>
      ) : null}
      {videos.map((file) => (
        <div key={file.id} className="space-y-1">
          <VideoPiece src={channelFileUrl(channelId, file.id)} name={file.name} size={file.size} />
          <button type="button" onClick={() => setOpen(file)} className="text-xs text-muted hover:text-ink">
            Ampliar
          </button>
        </div>
      ))}
      {audios.map((file) => (
        <AudioPiece key={file.id} src={channelFileUrl(channelId, file.id)} name={file.name} size={file.size} />
      ))}
      {documents.map((file) => {
        const pdf = file.mime === "application/pdf";
        const href = channelFileUrl(channelId, file.id);
        return (
          <div key={file.id} className="flex items-center gap-3 rounded-xl border border-line bg-elevated px-3 py-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-hover text-faint">
              <FileText className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{file.name}</span>
              <span className="text-[11px] text-faint">
                {pdf ? "PDF" : "Documento"} · {formatBytes(file.size)}
              </span>
            </span>
            {pdf ? (
              <button type="button" onClick={() => setOpen(file)} className="text-xs text-ink">
                Abrir
              </button>
            ) : (
              <a href={href} download={file.name} className="text-xs text-ink">
                Baixar
              </a>
            )}
          </div>
        );
      })}
      {open ? <FileStage channelId={channelId} file={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function FileStage({
  channelId,
  file,
  onClose,
}: {
  channelId: string;
  file: ChannelFile;
  onClose: () => void;
}) {
  const url = channelFileUrl(channelId, file.id);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
      className="fixed inset-0 z-[80] flex flex-col bg-[#0d0c0c] text-white"
    >
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{file.name}</p>
          <p className="text-xs text-white/50">
            {KIND_LABEL[file.kind] ?? "Arquivo"} · {formatBytes(file.size)}
          </p>
        </div>
        <a
          href={url}
          download={file.name}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:text-white"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
          Baixar
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar visualização"
          className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
        {file.kind === "image" ? (
          <img
            src={url}
            alt={file.name}
            referrerPolicy="no-referrer"
            className="max-h-full max-w-full object-contain"
          />
        ) : null}
        {file.kind === "video" ? (
          <div className="w-full max-w-5xl">
            <VideoPiece src={url} name={file.name} size={file.size} large />
          </div>
        ) : null}
        {file.kind === "audio" ? (
          <div className="w-full max-w-lg">
            <AudioPiece src={url} name={file.name} size={file.size} />
          </div>
        ) : null}
        {file.mime === "application/pdf" ? (
          <iframe title={file.name} src={url} className="h-full w-full max-w-4xl rounded-lg bg-white" />
        ) : null}
        {file.kind === "document" && file.mime !== "application/pdf" ? (
          <div className="max-w-sm text-center">
            <p className="text-sm leading-6 text-white/70">
              Este documento abre no computador. Ele continua guardado neste espaço.
            </p>
            <a
              href={url}
              download={file.name}
              className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
            >
              Baixar
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
