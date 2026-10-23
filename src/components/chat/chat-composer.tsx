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
import { AudioWaveformVisualizer } from "./audio-waveform-visualizer";
import { cn } from "@/lib/cn";
import { useChat } from "@/lib/chat";
import { AGENT_PRESETS, agentReady, usePrefs } from "@/lib/prefs";
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

export const DEFAULT_CHAT_PLACEHOLDERS = [
  "Arraste e solte pastas no chat",
  "Alterne para o Modo Build para criar apps",
  "Criar uma tarefa urgente para amanhã...",
  "Solicitar uma nova demanda de carrossel ou reels...",
  "Quais tarefas da equipe estão atrasadas?",
  "O que vence nos meus projetos nos próximos 7 dias?",
  "Analisar um briefing ou PDF anexado...",
  "Como está o desempenho e entregas do mês?",
];

function useTypewriterPlaceholder(phrases: string[], enabled = true) {
  const [currentText, setCurrentText] = useState("");
  const phraseIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const isDeletingRef = useRef(false);

  useEffect(() => {
    if (!enabled || phrases.length === 0) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    function tick() {
      const currentPhrase = phrases[phraseIndexRef.current % phrases.length];

      if (isDeletingRef.current) {
        charIndexRef.current--;
        setCurrentText(currentPhrase.slice(0, charIndexRef.current));

        if (charIndexRef.current <= 0) {
          isDeletingRef.current = false;
          phraseIndexRef.current = (phraseIndexRef.current + 1) % phrases.length;
          timeoutId = setTimeout(tick, 350);
          return;
        }
        timeoutId = setTimeout(tick, 22);
      } else {
        charIndexRef.current++;
        setCurrentText(currentPhrase.slice(0, charIndexRef.current));

        if (charIndexRef.current >= currentPhrase.length) {
          isDeletingRef.current = true;
          timeoutId = setTimeout(tick, 2200);
          return;
        }
        timeoutId = setTimeout(tick, 45);
      }
    }

    timeoutId = setTimeout(tick, 350);

    return () => clearTimeout(timeoutId);
  }, [enabled, phrases]);

  return currentText;
}

export function ChatComposer({
  hero = false,
  autoFocus = false,
  placeholder,
  placeholderPhrases,
  className,
}: {
  hero?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  placeholderPhrases?: string[];
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
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [liveTranscription, setLiveTranscription] = useState("");
  const liveTranscriptionRef = useRef("");

  // Menus suspensos
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordingSecondsRef = useRef(0);
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const dictationBaseTextRef = useRef("");

  const ready = agentReady(agent);

  const phrasesToUse = placeholderPhrases || DEFAULT_CHAT_PLACEHOLDERS;
  const animatedPlaceholder = useTypewriterPlaceholder(
    phrasesToUse,
    !placeholder && value.length === 0,
  );

  const presetInfo =
    (agent.preset && AGENT_PRESETS[agent.preset as keyof typeof AGENT_PRESETS]) || null;
  const presetLabel = presetInfo?.label || (agent.preset ? String(agent.preset) : "Personalizado");
  const configuredModelName = agent.model?.trim() || "";

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

  // Gravação de Áudio via MediaRecorder com Onda Sonora em Tempo Real e Transcrição Automática
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);
      audioChunksRef.current = [];
      recordingSecondsRef.current = 0;
      liveTranscriptionRef.current = "";
      setLiveTranscription("");

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
        stream.getTracks().forEach((track) => track.stop());
        setMediaStream(null);
        setIsRecording(false);
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordTimerRef.current = window.setInterval(() => {
        recordingSecondsRef.current += 1;
        setRecordingSeconds(recordingSecondsRef.current);
      }, 1000);

      // Inicia transcrição de voz automática em tempo real em português
      const SpeechClass =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechClass) {
        try {
          const speech: SpeechRecognitionInstance = new SpeechClass();
          speech.continuous = true;
          speech.interimResults = true;
          speech.lang = "pt-BR";

          speech.onresult = (event: any) => {
            let finalTranscript = "";
            let interimTranscript = "";

            for (let i = 0; i < event.results.length; ++i) {
              const item = event.results[i];
              const text = item[0]?.transcript || "";
              if (item.isFinal) {
                finalTranscript += (finalTranscript ? " " : "") + text.trim();
              } else {
                interimTranscript += (interimTranscript ? " " : "") + text.trim();
              }
            }

            const recognized = [finalTranscript, interimTranscript]
              .filter(Boolean)
              .join(" ")
              .trim();

            liveTranscriptionRef.current = recognized;
            setLiveTranscription(recognized);
          };

          speech.onerror = () => {};
          speech.onend = () => {};
          speech.start();
          speechRecognitionRef.current = speech;
        } catch {}
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
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      if (!save) {
        audioChunksRef.current = [];
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
        setMediaStream(null);
        setIsRecording(false);
        liveTranscriptionRef.current = "";
        setLiveTranscription("");
      } else {
        mediaRecorderRef.current.stop();

        // Insere o texto transcrito diretamente na caixa de mensagem como mensagem normal
        const transcribed = liveTranscriptionRef.current.trim();
        if (transcribed) {
          setValue((prev) => {
            const base = prev.trim();
            return base ? `${base} ${transcribed}` : transcribed;
          });
        }
        liveTranscriptionRef.current = "";
        setLiveTranscription("");
        setTimeout(() => {
          ref.current?.focus();
        }, 50);
      }
    } else {
      setMediaStream(null);
      setIsRecording(false);
      liveTranscriptionRef.current = "";
      setLiveTranscription("");
    }
  }

  async function submitRecordingNow() {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {}
      speechRecognitionRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      if (isRecording) stopRecording(false);
      return;
    }

    const duration = recordingSecondsRef.current || 1;
    const mimeType = recorder.mimeType || "audio/webm";

    recorder.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      recorder.stream.getTracks().forEach((track) => track.stop());
      setMediaStream(null);
      setIsRecording(false);

      let textToSend = liveTranscriptionRef.current.trim() || value.trim();

      // Fallback: se o navegador não transcreveu e temos chave de API configurada, transcreve via Whisper
      if (!textToSend && agent.apiKey) {
        try {
          const form = new FormData();
          form.append("file", audioBlob, "audio.webm");
          form.append("apiKey", agent.apiKey);
          form.append("baseUrl", agent.baseUrl);
          const res = await fetch("/api/ai/transcribe-audio", {
            method: "POST",
            body: form,
          });
          const data = await res.json();
          if (data.ok && data.text?.trim()) {
            textToSend = data.text.trim();
          }
        } catch {}
      }

      if (!textToSend) {
        return;
      }

      const imagesToSend = [...images];
      const documentsToSend = [...documents];

      setValue("");
      setImages([]);
      setAttachedAudio(null);
      setDocuments([]);
      setLiveTranscription("");
      liveTranscriptionRef.current = "";

      // Envia como mensagem de chat normal
      void send({
        text: textToSend,
        images: imagesToSend,
        documents: documentsToSend,
      });
    };

    recorder.stop();
  }

  // Ditado de voz para texto (Speech-to-Text em tempo real no textarea)
  function toggleDictation() {
    if (isDictating) {
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
        speechRecognitionRef.current = null;
      }
      setIsDictating(false);
      dictationBaseTextRef.current = value.trim();
      return;
    }

    const SpeechClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechClass) {
      alert("Reconhecimento de fala não suportado neste navegador. Recomendamos Google Chrome, Edge ou Safari.");
      return;
    }

    try {
      const speech: SpeechRecognitionInstance = new SpeechClass();
      speech.continuous = true;
      speech.interimResults = true;
      speech.lang = "pt-BR";

      // Fix do bug de duplicação: armazena a base inicial antes do início do ditado
      dictationBaseTextRef.current = value.trim();

      speech.onresult = (event: any) => {
        let finalTranscript = "";
        let interimTranscript = "";

        // Itera sobre todos os blocos de fala reconhecidos na sessão
        for (let i = 0; i < event.results.length; ++i) {
          const item = event.results[i];
          const text = item[0]?.transcript || "";
          if (item.isFinal) {
            finalTranscript += (finalTranscript ? " " : "") + text.trim();
          } else {
            interimTranscript += (interimTranscript ? " " : "") + text.trim();
          }
        }

        const recognizedText = [finalTranscript, interimTranscript]
          .filter(Boolean)
          .join(" ")
          .trim();

        const base = dictationBaseTextRef.current;
        const combined = base
          ? (recognizedText ? `${base} ${recognizedText}` : base)
          : recognizedText;

        setValue(combined);
      };

      speech.onerror = (event: any) => {
        if (event.error !== "no-speech") {
          setIsDictating(false);
        }
      };

      speech.onend = () => {
        setIsDictating(false);
      };

      speech.start();
      speechRecognitionRef.current = speech;
      setIsDictating(true);
    } catch {
      alert("Não foi possível acessar o microfone para ditado.");
      setIsDictating(false);
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
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
        speechRecognitionRef.current = null;
      }
      setIsDictating(false);
      dictationBaseTextRef.current = "";
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

      {/* Caixa do Chat Unificada: Estilo correspondente as referencias visuais de modo claro e escuro */}
      <div
        className={cn(
          "relative flex flex-col rounded-[28px] transition-colors",
          "bg-white dark:bg-[#201f1d] text-ink",
          "border border-[#e6e5e3] dark:border-[#30302e]",
          isRecording ? "p-2 sm:p-2.5" : hero ? "p-4 pb-3" : "p-3 pb-2.5",
        )}
      >
        {/* Documentos / PDFs Anexados */}
        {!isRecording && documents.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1 pt-0.5">
            {documents.map((doc, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2.5 rounded-2xl bg-zinc-50 dark:bg-[#191919] px-3 py-1.5 text-xs text-ink border border-black/[0.05] dark:border-white/[0.06] shadow-2xs"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex flex-col min-w-0 pr-1">
                  <span className="font-medium truncate max-w-[180px] sm:max-w-[240px]">
                    {doc.name}
                  </span>
                  <span className="text-[10px] text-muted">
                    {(doc.size / (1024 * 1024)).toFixed(1)} MB
                    {doc.pageCount ? ` · ${doc.pageCount} pág.` : ""} · Pronto para análise
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDocuments((prev) => prev.filter((_, i) => i !== idx))}
                  className="rounded-full p-1 text-muted hover:bg-black/5 dark:hover:bg-white/10 hover:text-red-500 transition-colors"
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
          <div className="mb-2 flex items-center gap-2.5 rounded-2xl bg-zinc-50 dark:bg-[#191919] px-3 py-2 text-xs text-muted border border-black/[0.05] dark:border-white/[0.06]">
            <LoaderCircle className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
            <span className="truncate">
              Processando <strong className="text-ink">{parsingFileName}</strong> (lendo texto e páginas do PDF)...
            </span>
          </div>
        )}

        {/* Pré-visualização de Imagens Anexadas */}
        {!isRecording && images.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1 pt-0.5">
            {images.map((img, idx) => (
              <div
                key={idx}
                className="group relative h-16 w-16 overflow-hidden rounded-xl bg-zinc-100 dark:bg-[#191919] border border-black/[0.05] dark:border-white/[0.06]"
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



        {/* Barra Ativa de Gravação de Áudio com visualizador em tempo real conforme referência */}
        {isRecording ? (
          <div className="flex flex-col gap-1 px-1 py-1">
            <div className="flex items-center justify-between gap-2">
              {/* Botão Cancelar ( ✕ ) à esquerda */}
              <button
                type="button"
                onClick={() => stopRecording(false)}
                title="Cancelar gravação"
                aria-label="Cancelar gravação"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400 hover:text-red-500 hover:border-red-500/40 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>

              {/* Onda Sonora em Tempo Real no centro */}
              <div className="flex-1 min-w-0 h-9 flex items-center px-2 overflow-hidden">
                <AudioWaveformVisualizer stream={mediaStream} className="w-full h-8" />
              </div>

              {/* Ações à direita: Parar ( ■ ) e Enviar Imediatamente ( ↑ ) */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Botão Parar / Concluir ( ■ ) */}
                <button
                  type="button"
                  onClick={() => stopRecording(true)}
                  title="Concluir áudio e manter transcrição"
                  aria-label="Concluir gravação"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200 hover:bg-black/[0.08] dark:hover:bg-white/[0.12] transition-colors cursor-pointer"
                >
                  <div className="h-3 w-3 rounded-[2px] bg-zinc-800 dark:bg-white" />
                </button>

                {/* Botão Enviar Imediatamente ( ↑ ) */}
                <button
                  type="button"
                  onClick={() => submitRecordingNow()}
                  title="Enviar áudio transcrito agora"
                  aria-label="Enviar áudio"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1d6eed] hover:bg-[#2563eb] text-white transition-all active:scale-95 shadow-none cursor-pointer"
                >
                  <ArrowUp className="h-4.5 w-4.5 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Transcrição de voz em tempo real exibida suavemente enquanto fala */}
            {liveTranscription && (
              <div className="text-center text-[12px] text-muted italic truncate px-3 py-0.5 animate-in fade-in">
                &ldquo;{liveTranscription}&rdquo;
              </div>
            )}
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
              onChange={(event) => {
                setValue(event.target.value);
                dictationBaseTextRef.current = event.target.value.trim();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={
                hydrated && !ready
                  ? "Conecte um agente nas configurações para conversar"
                  : placeholder || animatedPlaceholder || "Arraste e solte pastas no chat"
              }
              aria-label="Mensagem para o agente"
              className={cn(
                "w-full resize-none bg-transparent text-ink outline-none",
                "placeholder:text-zinc-500 dark:placeholder:text-zinc-400",
                "disabled:cursor-not-allowed text-[15px] leading-6",
                "overflow-y-auto max-h-[220px] chat-textarea-scroll py-1",
              )}
              style={{ minHeight: "28px" }}
            />
          </div>
        )}

        {/* Barra de Ferramentas Inferior */}
        {!isRecording && (
          <div className="flex items-center justify-between pt-2">
          {/* Lado Esquerdo: Botão "+" minimalista conforme referência */}
          <div className="relative">
            <button
              type="button"
              disabled={!ready || parsingDoc}
              onClick={() => setPlusMenuOpen((prev) => !prev)}
              title="Anexar arquivos, imagens ou gravar áudio"
              aria-label="Adicionar anexo"
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 transition-colors disabled:opacity-40"
            >
              <Plus className="h-4.5 w-4.5 stroke-[2]" />
            </button>

            {plusMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setPlusMenuOpen(false)}
                />
                <div className="absolute bottom-full left-0 mb-2 z-50 w-64 rounded-2xl bg-white dark:bg-[#1c1a18] border border-[#e6e5e3] dark:border-[#30302e] p-1.5 text-xs text-ink shadow-2xl backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      docInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-red-500 shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-medium text-ink">Documento ou PDF</span>
                      <span className="text-[10px] text-muted">Analisa arquivos até 25MB</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  >
                    <ImageIcon className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-medium text-ink">Anexar imagens</span>
                      <span className="text-[10px] text-muted">Fotos e diagramas</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPlusMenuOpen(false);
                      startRecording();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  >
                    <Mic className="h-4 w-4 text-amber-500 shrink-0" />
                    <div className="flex flex-col">
                      <span className="font-medium text-ink">Gravar áudio</span>
                      <span className="text-[10px] text-muted">Enviar gravação de voz</span>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Lado Direito: Seletor de Modelo, Microfone e Botão de Ação */}
          <div className="flex items-center gap-2">
            {/* Seletor de Modelo - 'Auto ⌵' conforme as imagens de referência */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setModelMenuOpen((prev) => !prev)}
                className="flex items-center gap-1 px-1.5 py-1 text-[13px] text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer"
                title={`Modelo ativo: ${configuredModelName || presetLabel}`}
              >
                <span>{configuredModelName || "Auto"}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70 shrink-0" strokeWidth={1.75} />
              </button>

              {modelMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setModelMenuOpen(false)}
                  />
                  <div className="absolute bottom-full right-0 mb-2 z-50 w-64 rounded-2xl bg-white dark:bg-[#1c1a18] border border-[#e6e5e3] dark:border-[#30302e] p-2 text-xs text-ink shadow-2xl backdrop-blur-md">
                    <div className="px-2.5 py-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
                      Modelo do Assistente
                    </div>

                    {ready ? (
                      <div className="mt-1 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            Ativo e Conectado
                          </span>
                          <span className="rounded-md bg-black/5 dark:bg-white/10 px-2 py-0.5 text-[10px] text-muted font-mono">
                            {presetLabel}
                          </span>
                        </div>

                        <div className="mt-2 font-semibold text-ink text-sm truncate" title={configuredModelName}>
                          {configuredModelName}
                        </div>

                        <p className="mt-1 text-[11px] text-muted leading-relaxed">
                          Executando com sua própria chave de API configurada.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-1 rounded-xl bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                          <span className="h-2 w-2 rounded-full bg-amber-500" />
                          Nenhum modelo configurado
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed opacity-90">
                          Adicione sua chave de API e modelo nas configurações para ativar as respostas do agente.
                        </p>
                      </div>
                    )}

                    <div className="my-1.5 h-px bg-black/[0.06] dark:bg-white/[0.08]" />

                    <Link
                      href="/configuracoes?tab=agente"
                      onClick={() => setModelMenuOpen(false)}
                      className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-muted hover:bg-black/5 dark:hover:bg-white/10 hover:text-ink transition-colors"
                    >
                      <Settings className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-medium">
                        {ready ? "Alterar modelo ou chave de API..." : "Configurar modelo de IA..."}
                      </span>
                    </Link>
                  </div>
                </>
              )}
            </div>

            {/* Botão de Gravação de Áudio com Microfone */}
            <button
              type="button"
              disabled={!ready || parsingDoc}
              onClick={startRecording}
              title="Gravar mensagem de áudio"
              aria-label="Gravar áudio"
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Mic className="h-4 w-4 stroke-[1.75]" />
            </button>

            {/* Botão Principal à Direita:
                1. Em execução -> Parar
                2. Padrão -> Botão circular com Seta para cima (habilitado quando há conteúdo, desabilitado quando vazio)
            */}
            {sending ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Parar resposta"
                title="Parar resposta"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-base hover:opacity-90 transition-all active:scale-95 cursor-pointer"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                aria-label="Enviar mensagem"
                title={canSubmit ? "Enviar mensagem" : "Digite uma mensagem para enviar"}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-95",
                  canSubmit
                    ? "bg-[#1d6eed] hover:bg-[#2563eb] text-white cursor-pointer"
                    : "bg-black/5 dark:bg-white/10 text-zinc-400 dark:text-zinc-600 cursor-not-allowed opacity-50",
                )}
              >
                <ArrowUp className="h-4.5 w-4.5 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
        )}
      </div>

      {hydrated && !ready ? (
        <p className="mt-3 text-center text-xs text-muted">
          <Link
            href="/configuracoes?tab=agente"
            className="text-ink font-medium underline underline-offset-2 hover:opacity-80"
          >
            Conectar meu agente
          </Link>{" "}
          com uma chave de API para habilitar chat, análise de PDFs, áudio e imagens.
        </p>
      ) : null}
    </div>
  );
}
