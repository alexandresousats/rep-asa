"use client";

import {
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Mic,
  Plus,
  Radio,
  Settings,
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

const MODEL_OPTIONS = [
  { id: "fast", label: "Fast", desc: "Ultra-rápido e econômico" },
  { id: "gpt-6.1", label: "GPT-6.1 Sol Leve", desc: "Equilíbrio de raciocínio e precisão" },
  { id: "grok-4", label: "Grok-4", desc: "Raciocínio avançado e análise xAI" },
  { id: "claude-3.5", label: "Claude 3.5 Sonnet", desc: "Alta precisão para código e tarefas" },
];

export function ChatComposer({
  hero = false,
  autoFocus = false,
  placeholder = "Alterne para o Modo Build para criar apps",
  className,
}: {
  hero?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
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

  // Estados de gravação de áudio e ditado
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isDictating, setIsDictating] = useState(false);

  // Menus suspensos
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const ready = agentReady(agent);

  // Quando não houver seleção manual:
  // Se houver texto digitado -> exibe "GPT-6.1 Sol Leve" (como na imagem 1)
  // Se o campo estiver vazio -> exibe "Fast" (como na imagem 2)
  const currentModelLabel =
    selectedModel ?? (value.trim().length > 0 ? "GPT-6.1 Sol Leve" : "Fast");

  // Ajusta altura do textarea dinamicamente
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(Math.max(el.scrollHeight, 28), 220);
    el.style.height = `${newHeight}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // Limpeza de timers e processos ao desmontar
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
        // PDF ou documentos de texto (até 25MB)
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

  // Gravação de Áudio / Modo Voz
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
    } catch {
      alert("Permissão de microfone negada ou microfone indisponível.");
    }
  }

  function stopRecording(save = true) {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
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

  // Ditado de voz para texto (Speech-to-Text no textarea)
  function toggleDictation() {
    if (isDictating) {
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
        speechRecognitionRef.current = null;
      }
      setIsDictating(false);
      return;
    }

    const SpeechClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechClass) {
      void startRecording();
      return;
    }

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
      speech.onerror = () => setIsDictating(false);
      speech.onend = () => setIsDictating(false);
      speech.start();
      speechRecognitionRef.current = speech;
      setIsDictating(true);
    } catch {
      void startRecording();
    }
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

    if (isDictating) {
      toggleDictation();
    }

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

  const hasContent =
    Boolean(value.trim()) ||
    images.length > 0 ||
    Boolean(attachedAudio) ||
    documents.length > 0;

  const canSubmit = hasContent && ready && !parsingDoc;

  return (
    <div className={className}>
      {/* Input Oculto para Imagens */}
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

      {/* Input Oculto para PDFs e Documentos grandes (até 25MB) */}
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

      {/* Caixa do Chat Unificada: Estilo visual escuro idêntico às imagens anexadas */}
      <div
        className={cn(
          "relative flex flex-col rounded-[26px] bg-[#212121] text-zinc-100 shadow-lg transition-all",
          hero ? "p-4 pb-3" : "p-3.5 pb-2.5",
        )}
      >
        {/* Documentos / PDFs Anexados */}
        {documents.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1 pt-0.5">
            {documents.map((doc, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2.5 rounded-2xl bg-[#191919] px-3 py-1.5 text-xs text-zinc-200 shadow-2xs"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/15 text-red-400">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="font-medium truncate max-w-[180px] sm:max-w-[240px]">
                    {doc.name}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {(doc.size / (1024 * 1024)).toFixed(1)} MB
                    {doc.pageCount ? ` · ${doc.pageCount} pág.` : ""} · Pronto para análise
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDocuments((prev) => prev.filter((_, i) => i !== idx))}
                  className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-red-400 transition-colors"
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
          <div className="mb-2 flex items-center gap-2.5 rounded-2xl bg-[#191919] px-3 py-2 text-xs text-zinc-300">
            <LoaderCircle className="h-4 w-4 animate-spin text-blue-400 shrink-0" />
            <span className="truncate">
              Processando <strong>{parsingFileName}</strong> (lendo texto e páginas do PDF)...
            </span>
          </div>
        )}

        {/* Pré-visualização de Imagens Anexadas */}
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1 pt-0.5">
            {images.map((img, idx) => (
              <div
                key={idx}
                className="group relative h-16 w-16 overflow-hidden rounded-xl bg-black/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={`Preview ${idx}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-white opacity-90 transition-opacity hover:opacity-100"
                  aria-label="Remover imagem"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pré-visualização de Áudio Gravado/Anexado */}
        {attachedAudio && !isRecording && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl bg-[#191919] px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-zinc-200">
              <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
              <span>Mensagem de voz anexada ({formatSeconds(attachedAudio.duration || 0)})</span>
            </div>
            <button
              type="button"
              onClick={() => setAttachedAudio(null)}
              className="text-zinc-400 hover:text-red-400 transition-colors"
              aria-label="Remover áudio"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Barra Ativa de Gravação de Áudio */}
        {isRecording ? (
          <div className="flex items-center justify-between gap-3 px-2 py-2">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-sm font-medium text-white">
                Gravando ({formatSeconds(recordingSeconds)})
              </span>
              <span className="hidden text-xs text-zinc-400 sm:inline">
                Fale agora com o assistente...
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stopRecording(false)}
                title="Descartar gravação"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-red-400 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => stopRecording(true)}
                title="Concluir áudio"
                className="flex h-8 px-3.5 items-center justify-center rounded-full bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-all"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          /* Campo de Texto Principal */
          <div className="flex flex-col">
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
                  : placeholder
              }
              aria-label="Mensagem para o agente"
              className={cn(
                "w-full resize-none bg-transparent text-white outline-none placeholder:text-[#8e8e8e] disabled:cursor-not-allowed text-[15px] leading-6",
                "overflow-y-auto max-h-[220px] chat-textarea-scroll py-1",
              )}
              style={{ minHeight: "28px" }}
            />
          </div>
        )}

        {/* Barra de Ferramentas Inferior: Exatamente como nas imagens anexadas */}
        <div className="flex items-center justify-between pt-2">
          {/* Lado Esquerdo: Botão "+" com menu suspenso */}
          <div className="relative">
            <button
              type="button"
              disabled={!ready || parsingDoc}
              onClick={() => setPlusMenuOpen((prev) => !prev)}
              title="Anexar arquivos, imagens ou gravar áudio"
              aria-label="Adicionar anexo"
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              <Plus className="h-5 w-5 stroke-[2.2]" />
            </button>

            {plusMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setPlusMenuOpen(false)}
                />
                <div className="absolute bottom-full left-0 mb-2 z-50 w-64 rounded-2xl border border-white/10 bg-[#1c1c1c] p-1.5 text-xs text-zinc-200 shadow-2xl backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      docInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <FileText className="h-4 w-4 text-red-400" />
                    <div className="flex flex-col">
                      <span className="font-medium">Documento ou PDF</span>
                      <span className="text-[10px] text-zinc-400">Analisa arquivos até 25MB</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <ImageIcon className="h-4 w-4 text-emerald-400" />
                    <div className="flex flex-col">
                      <span className="font-medium">Anexar imagens</span>
                      <span className="text-[10px] text-zinc-400">Fotos e diagramas</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      startRecording();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <Mic className="h-4 w-4 text-amber-400" />
                    <div className="flex flex-col">
                      <span className="font-medium">Gravar áudio</span>
                      <span className="text-[10px] text-zinc-400">Enviar gravação de voz</span>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Lado Direito: Seletor de Modelo, Microfone e Botão de Ação */}
          <div className="flex items-center gap-2">
            {/* Seletor de Modelo (ex: "Fast ⌵" ou "GPT-6.1 Sol Leve ⌵") */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setModelMenuOpen((prev) => !prev)}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Selecionar modelo"
              >
                <span>{currentModelLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
              </button>

              {modelMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setModelMenuOpen(false)}
                  />
                  <div className="absolute bottom-full right-0 mb-2 z-50 w-56 rounded-2xl border border-white/10 bg-[#1c1c1c] p-1.5 text-xs text-zinc-200 shadow-2xl backdrop-blur-md">
                    <div className="px-2.5 py-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                      Modelo do Assistente
                    </div>
                    {MODEL_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSelectedModel(opt.label);
                          setModelMenuOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left hover:bg-white/10 transition-colors",
                          currentModelLabel === opt.label
                            ? "text-blue-400 font-medium"
                            : "text-zinc-200",
                        )}
                      >
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          <span className="text-[10px] text-zinc-400">{opt.desc}</span>
                        </div>
                        {currentModelLabel === opt.label && (
                          <Check className="h-3.5 w-3.5 shrink-0" />
                        )}
                      </button>
                    ))}
                    <div className="my-1 border-t border-white/10" />
                    <Link
                      href="/configuracoes?tab=agente"
                      onClick={() => setModelMenuOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      <span>Configurações da API...</span>
                    </Link>
                  </div>
                </>
              )}
            </div>

            {/* Botão de Ditado com Microfone */}
            <button
              type="button"
              disabled={!ready || parsingDoc}
              onClick={toggleDictation}
              title={isDictating ? "Parar ditado por voz" : "Ditar texto com microfone"}
              aria-label="Microfone"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40",
                isDictating
                  ? "bg-red-500/20 text-red-400 animate-pulse"
                  : "text-zinc-400 hover:text-white hover:bg-white/10",
              )}
            >
              <Mic className="h-4 w-4 stroke-[1.75]" />
            </button>

            {/* Botão Principal à Direita:
                1. Em execução -> Parar (quadrado branco/preto)
                2. Com texto / anexos -> Botão circular Azul com Seta para cima (Imagem 1)
                3. Sem texto / Vazio -> Botão circular escuro com Barras de Onda Azul (Modo Voz) (Imagem 2)
            */}
            {sending ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Parar resposta"
                title="Parar resposta"
                className="flex h-8.5 w-8.5 items-center justify-center rounded-full bg-white text-black hover:bg-zinc-200 transition-all shadow-md active:scale-95"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : hasContent ? (
              /* Imagem 1: Círculo Azul com seta branca apontando para cima */
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                aria-label="Enviar mensagem"
                title="Enviar"
                className="flex h-8.5 w-8.5 items-center justify-center rounded-full bg-[#1d6eed] hover:bg-[#2563eb] text-white shadow-md transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowUp className="h-4.5 w-4.5 stroke-[2.5]" />
              </button>
            ) : (
              /* Imagem 2: Pílula circular escura com barras azuis de forma de onda (Modo Voz) */
              <button
                type="button"
                disabled={!ready || parsingDoc}
                onClick={startRecording}
                title="Modo Voz / Conversa em tempo real"
                aria-label="Iniciar modo voz"
                className="group relative flex h-8.5 w-8.5 items-center justify-center rounded-full bg-[#171717] hover:bg-[#262626] shadow-sm transition-all active:scale-95 disabled:opacity-40"
              >
                <div className="flex items-center gap-[2.5px] h-4">
                  <span className="w-[2.5px] h-2 bg-[#38bdf8] rounded-full group-hover:h-3 transition-all duration-200" />
                  <span className="w-[2.5px] h-3.5 bg-[#38bdf8] rounded-full group-hover:h-4 transition-all duration-200" />
                  <span className="w-[2.5px] h-4.5 bg-[#38bdf8] rounded-full group-hover:h-5 transition-all duration-200" />
                  <span className="w-[2.5px] h-3 bg-[#38bdf8] rounded-full group-hover:h-3.5 transition-all duration-200" />
                  <span className="w-[2.5px] h-1.5 bg-[#38bdf8] rounded-full group-hover:h-2.5 transition-all duration-200" />
                </div>
              </button>
            )}
          </div>
        </div>
      </div>

      {hydrated && !ready ? (
        <p className="mt-3 text-center text-xs text-zinc-500">
          <Link
            href="/configuracoes?tab=agente"
            className="text-zinc-400 underline underline-offset-2 hover:text-white"
          >
            Conectar meu agente
          </Link>{" "}
          com uma chave de API para habilitar chat, análise de PDFs, áudio e imagens.
        </p>
      ) : null}
    </div>
  );
}
