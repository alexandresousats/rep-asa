"use client";

import {
  ArrowUp,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Mic,
  Paperclip,
  Radio,
  Square,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useChat } from "@/lib/chat";
import { agentReady, usePrefs } from "@/lib/prefs";
import type { ChatAudioAttachment, ChatDocumentAttachment } from "@/lib/types";

// Tipagem para Web Speech Recognition
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

export function ChatComposer({
  hero = false,
  autoFocus = false,
  className,
}: {
  hero?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const agent = usePrefs((state) => state.agent);
  const hydrated = usePrefs((state) => state.hasHydrated);
  const sending = useChat((state) => state.sending);
  const send = useChat((state) => state.send);
  const stop = useChat((state) => state.stop);

  const [value, setValue] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [documents, setDocuments] = useState<ChatDocumentAttachment[]>([]);
  const [parsingDoc, setParsingDoc] = useState(false);
  const [parsingFileName, setParsingFileName] = useState("");
  const [attachedAudio, setAttachedAudio] = useState<ChatAudioAttachment | null>(null);

  // Estados de gravação de áudio
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const ready = agentReady(agent);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // Limpeza de timers ao desmontar
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.abort();
      }
    };
  }, []);

  async function uploadDocument(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      alert(`O arquivo "${file.name}" tem ${(file.size / (1024 * 1024)).toFixed(1)}MB. O limite máximo é de 25MB.`);
      return;
    }

    setParsingDoc(true);
    setParsingFileName(file.name);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/ai/parse-doc", {
        method: "POST",
        body: form,
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert(data.error || `Falha ao processar ${file.name}`);
        return;
      }

      setDocuments((prev) => [
        ...prev,
        {
          name: data.name,
          size: data.size,
          type: data.type,
          pageCount: data.pageCount,
          text: data.text,
        },
      ]);
    } catch (err: any) {
      alert(`Erro ao analisar ${file.name}: ${err?.message || "conexão interrompida"}`);
    } finally {
      setParsingDoc(false);
      setParsingFileName("");
    }
  }

  function handleFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    list.forEach((file) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          if (result) setImages((prev) => [...prev, result]);
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith("audio/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          if (result) {
            setAttachedAudio({
              url: result,
              mimeType: file.type,
            });
          }
        };
        reader.readAsDataURL(file);
      } else {
        // PDF ou documentos de texto
        void uploadDocument(file);
      }
    });
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const res = event.target?.result as string;
            if (res) setImages((prev) => [...prev, res]);
          };
          reader.readAsDataURL(file);
        }
      } else if (items[i].type === "application/pdf") {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) void uploadDocument(file);
      }
    }
  }

  // Gravação de Áudio
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/mp4";
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());

        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          setAttachedAudio({
            url: dataUrl,
            duration: recordingSeconds,
            mimeType,
          });
        };
        reader.readAsDataURL(audioBlob);
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      // Inicia transcrição de fala em tempo real caso o navegador suporte
      const SpeechClass =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechClass) {
        try {
          const speech: SpeechRecognitionInstance = new SpeechClass();
          speech.continuous = true;
          speech.interimResults = true;
          speech.lang = "pt-BR";
          speech.onresult = (event: any) => {
            let transcript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              transcript += event.results[i][0].transcript;
            }
            if (transcript.trim()) {
              setValue((prev) => {
                const base = prev.trim() ? `${prev.trim()} ` : "";
                return `${base}${transcript.trim()}`;
              });
            }
          };
          speech.start();
          speechRecognitionRef.current = speech;
        } catch {
          // Microfone continua gravando áudio mesmo se a API de fala falhar
        }
      }
    } catch {
      alert("Permissão de microfone negada ou microfone indisponível.");
    }
  }

  function stopRecording(save = true) {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      if (!save) {
        audioChunksRef.current = [];
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      } else {
        mediaRecorderRef.current.stop();
      }
    }
    setIsRecording(false);
  }

  function formatSeconds(sec: number) {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s.toString().padStart(2, "0")}`;
  }

  function submit() {
    const hasContent =
      value.trim() || images.length > 0 || attachedAudio || documents.length > 0;
    if (!hasContent || sending || !ready || parsingDoc) return;

    const textToSend = value;
    const imagesToSend = [...images];
    const audioToSend = attachedAudio ? { ...attachedAudio } : undefined;
    const documentsToSend = [...documents];

    setValue("");
    setImages([]);
    setAttachedAudio(null);
    setDocuments([]);

    void send({
      text: textToSend,
      images: imagesToSend,
      audio: audioToSend,
      documents: documentsToSend,
    });
  }

  const canSubmit =
    (value.trim() || images.length > 0 || attachedAudio || documents.length > 0) &&
    ready &&
    !parsingDoc;

  return (
    <div className={className}>
      {/* Input para Imagens */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFileSelect(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Input para PDFs e Documentos grandes (até 25MB) */}
      <input
        ref={docInputRef}
        type="file"
        accept="application/pdf,.pdf,.txt,.csv,.md,.json"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFileSelect(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Caixa do Composer */}
      <div
        className={cn(
          "flex flex-col border border-line bg-elevated transition-colors focus-within:border-muted",
          hero ? "rounded-[28px] p-3 pl-5" : "rounded-3xl p-2.5 pl-4",
        )}
      >
        {/* Documentos / PDFs Anexados */}
        {documents.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1 pt-1">
            {documents.map((doc, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2.5 rounded-2xl border border-line bg-base px-3 py-1.5 text-xs text-ink shadow-2xs"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="font-medium truncate max-w-[180px] sm:max-w-[240px]">
                    {doc.name}
                  </span>
                  <span className="text-[10px] text-faint">
                    {(doc.size / (1024 * 1024)).toFixed(1)} MB
                    {doc.pageCount ? ` · ${doc.pageCount} pág.` : ""} · Pronto para análise
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDocuments((prev) => prev.filter((_, i) => i !== idx))}
                  className="rounded-full p-1 text-faint hover:bg-hover hover:text-red-400"
                  aria-label="Remover documento"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Indicador de Processamento do PDF / Documento */}
        {parsingDoc && (
          <div className="mb-2 flex items-center gap-2.5 rounded-2xl border border-line bg-base px-3 py-2 text-xs text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin text-ink shrink-0" />
            <span className="truncate">
              Processando <strong>{parsingFileName}</strong> (lendo texto e páginas do PDF)...
            </span>
          </div>
        )}

        {/* Pré-visualização de Imagens Anexadas */}
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1 pt-1">
            {images.map((img, idx) => (
              <div
                key={idx}
                className="group relative h-16 w-16 overflow-hidden rounded-xl border border-line bg-base"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={`Preview ${idx}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white opacity-90 transition-opacity hover:opacity-100"
                  aria-label="Remover anexo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pré-visualização de Áudio Gravado/Anexado */}
        {attachedAudio && !isRecording && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl border border-line-subtle bg-base px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-ink">
              <Radio className="h-4 w-4 text-emerald-500 animate-pulse" />
              <span>Mensagem de voz pronta ({formatSeconds(attachedAudio.duration || 0)})</span>
            </div>
            <button
              type="button"
              onClick={() => setAttachedAudio(null)}
              className="text-faint hover:text-red-400"
              aria-label="Remover áudio"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Barra de Gravação de Áudio Ativa */}
        {isRecording ? (
          <div className="flex items-center justify-between gap-3 px-2 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-sm font-medium text-ink">
                Gravando áudio ({formatSeconds(recordingSeconds)})
              </span>
              <span className="hidden text-xs text-faint sm:inline">
                Fale agora, estamos ouvindo...
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stopRecording(false)}
                title="Descartar gravação"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => stopRecording(true)}
                title="Concluir áudio"
                className="flex h-9 px-3.5 items-center justify-center rounded-full bg-ink text-xs font-medium text-base hover:opacity-90 transition-all"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={ref}
              rows={1}
              value={value}
              disabled={hydrated && !ready}
              onPaste={handlePaste}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={
                hydrated && !ready
                  ? "Conecte um agente nas configurações para conversar"
                  : "Peça ao agente, anexe PDF (até 20MB), imagens ou grave áudio…"
              }
              aria-label="Mensagem para o agente"
              className={cn(
                "max-h-[200px] flex-1 resize-none bg-transparent text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed",
                hero ? "py-2.5 text-base leading-6" : "py-2 text-sm leading-6",
              )}
            />

            {/* Ações do Composer (Anexos, PDF, Imagens, Áudio, Envio) */}
            <div className="flex items-center gap-1 pb-1">
              {/* Botão Anexar PDF / Documentos */}
              <button
                type="button"
                disabled={!ready || parsingDoc}
                onClick={() => docInputRef.current?.click()}
                title="Anexar PDF ou Documento (até 20MB)"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink disabled:opacity-40 transition-colors"
              >
                <Paperclip className="h-4 w-4" strokeWidth={1.75} />
              </button>

              {/* Botão Anexar Imagem */}
              <button
                type="button"
                disabled={!ready || parsingDoc}
                onClick={() => fileInputRef.current?.click()}
                title="Anexar imagem"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink disabled:opacity-40 transition-colors"
              >
                <ImageIcon className="h-4 w-4" strokeWidth={1.75} />
              </button>

              {/* Botão Gravar Áudio */}
              <button
                type="button"
                disabled={!ready || parsingDoc}
                onClick={startRecording}
                title="Gravar áudio com microfone"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink disabled:opacity-40 transition-colors"
              >
                <Mic className="h-4 w-4" strokeWidth={1.75} />
              </button>

              {/* Botão de Enviar ou Parar */}
              {sending ? (
                <button
                  type="button"
                  onClick={stop}
                  aria-label="Parar resposta"
                  title="Parar resposta"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-base hover:opacity-90 transition-opacity"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit}
                  aria-label="Enviar mensagem"
                  title="Enviar"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-base transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {hydrated && !ready ? (
        <p className="mt-3 text-center text-xs text-faint">
          <Link
            href="/configuracoes?tab=agente"
            className="text-muted underline underline-offset-2 hover:text-ink"
          >
            Conectar meu agente
          </Link>{" "}
          com uma chave de API para habilitar chat, análise de PDFs, áudio e imagens.
        </p>
      ) : null}
    </div>
  );
}
