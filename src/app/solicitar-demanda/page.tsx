"use client";

import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  Film,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  Mic,
  Paperclip,
  Radio,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Tag as TagIcon,
  Trash2,
  UploadCloud,
  Video as VideoIcon,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type DemandLinkInfoResponse,
  chatWithDemandAgent,
  getDemandLinkInfo,
  submitDemandViaLink,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/dates";

interface MessageItem {
  id: string;
  role: "assistant" | "user";
  content: string;
  images?: string[];
  videos?: { name: string; url?: string; file?: File; base64?: string }[];
  documents?: { name: string; size: number; base64?: string }[];
  audio?: { url: string; duration?: number };
  createdAt: string;
}

interface AttachedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: "image" | "video" | "document";
  previewUrl?: string;
  base64?: string;
}

const FORMAT_OPTIONS = [
  {
    id: "card",
    label: "Card / Post",
    tagName: "Card",
    icon: Square,
    color: "text-sky-400",
    bgActive: "bg-sky-500/20 text-sky-300 border-sky-500/60",
    desc: "Post estático 1:1 ou 4:5",
  },
  {
    id: "carrossel",
    label: "Carrossel",
    tagName: "Carrossel",
    icon: Layers,
    color: "text-indigo-400",
    bgActive: "bg-indigo-500/20 text-indigo-300 border-indigo-500/60",
    desc: "Sequência de slides educativos ou de venda",
  },
  {
    id: "video_longo",
    label: "Vídeo Longo",
    tagName: "Vídeo Longo",
    icon: Film,
    color: "text-amber-400",
    bgActive: "bg-amber-500/20 text-amber-300 border-amber-500/60",
    desc: "YouTube, aula, entrevista ou VSL",
  },
  {
    id: "reels",
    label: "Reels / TikTok",
    tagName: "Reels",
    icon: Smartphone,
    color: "text-pink-400",
    bgActive: "bg-pink-500/20 text-pink-300 border-pink-500/60",
    desc: "Vídeo vertical dinâmico 9:16",
  },
];

function DemandChatContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [linkInfo, setLinkInfo] = useState<DemandLinkInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Estado do Chat
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);

  // Anexos em rascunho no composer
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [attachedAudio, setAttachedAudio] = useState<{ url: string; duration: number } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  // Modal de URL externa de vídeo
  const [videoUrlModalOpen, setVideoUrlModalOpen] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState("");

  // Estado da Demanda Extraída
  const [demandSubject, setDemandSubject] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [referenceUrls, setReferenceUrls] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [isReadyToConfirm, setIsReadyToConfirm] = useState(false);

  // Submissão da Demanda
  const [submitting, setSubmitting] = useState(false);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<number | null>(null);

  // 1. Carrega dados do link verificado
  useEffect(() => {
    if (!token) {
      setLoadError("Nenhum token de verificação foi fornecido na URL.");
      setLoading(false);
      return;
    }

    async function verify() {
      setLoading(true);
      setLoadError("");
      try {
        const data = await getDemandLinkInfo(token);
        setLinkInfo(data);

        // Mensagem inicial do agente: Pergunta o assunto logo de cara, sabendo o projeto!
        const initialMsg: MessageItem = {
          id: "welcome",
          role: "assistant",
          content: `Olá! Sou o agente de criação de demandas do projeto **${data.project.name}**.\n\nQual é o **assunto** ou tema principal da demanda que você deseja solicitar hoje?`,
          createdAt: new Date().toISOString(),
        };
        setMessages([initialMsg]);
      } catch (err: any) {
        setLoadError(err?.message || "Link de demanda inválido, expirado ou não autorizado.");
      } finally {
        setLoading(false);
      }
    }

    void verify();
  }, [token]);

  // Rola até o final das mensagens
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // Auto-resize do textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(Math.max(el.scrollHeight, 28), 180);
    el.style.height = `${newHeight}px`;
  }, [inputText]);

  // Processa seleção de arquivos (imagens, vídeos e documentos)
  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      const kind: AttachedFile["kind"] = isImage ? "image" : isVideo ? "video" : "document";

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setAttachedFiles((prev) => [
          ...prev,
          {
            id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            kind,
            previewUrl: isImage || isVideo ? URL.createObjectURL(file) : undefined,
            base64,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }

  // Gravação de áudio
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        const reader = new FileReader();
        reader.onloadend = () => {
          setAttachedAudio({
            url: reader.result as string,
            duration: recordSeconds,
          });
        };
        reader.readAsDataURL(audioBlob);
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordSeconds(0);
      recordIntervalRef.current = window.setInterval(() => {
        setRecordSeconds((sec) => sec + 1);
      }, 1000);
    } catch {
      alert("Permissão de microfone negada ou indisponível.");
    }
  }

  function stopRecording(save = true) {
    if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
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

  // Adiciona link de vídeo externo
  function handleAddVideoUrl() {
    if (!videoUrlInput.trim()) return;
    const url = videoUrlInput.trim();
    setAttachedFiles((prev) => [
      ...prev,
      {
        id: `vid-${Date.now()}`,
        name: `Vídeo externo: ${url}`,
        type: "video/url",
        size: 0,
        kind: "video",
        previewUrl: url,
      },
    ]);
    setReferenceUrls((prev) => (prev ? `${prev}\n${url}` : url));
    setVideoUrlInput("");
    setVideoUrlModalOpen(false);
  }

  // Envio de mensagem para o agente
  async function handleSend(manualText?: string) {
    const textToSend = (manualText !== undefined ? manualText : inputText).trim();
    const hasAttachments = attachedFiles.length > 0 || Boolean(attachedAudio);

    if (!textToSend && !hasAttachments) return;
    if (sending) return;

    const currentFiles = [...attachedFiles];
    const currentAudio = attachedAudio;

    setInputText("");
    setAttachedFiles([]);
    setAttachedAudio(null);

    const userImages = currentFiles.filter((f) => f.kind === "image").map((f) => f.base64 || f.previewUrl || "");
    const userVideos = currentFiles
      .filter((f) => f.kind === "video")
      .map((f) => ({ name: f.name, url: f.previewUrl, base64: f.base64 }));
    const userDocs = currentFiles
      .filter((f) => f.kind === "document")
      .map((f) => ({ name: f.name, size: f.size, base64: f.base64 }));

    const userMessage: MessageItem = {
      id: `u-${Date.now()}`,
      role: "user",
      content: textToSend || (hasAttachments ? "(Anexos enviados para a demanda)" : ""),
      images: userImages.length > 0 ? userImages : undefined,
      videos: userVideos.length > 0 ? userVideos : undefined,
      documents: userDocs.length > 0 ? userDocs : undefined,
      audio: currentAudio || undefined,
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setSending(true);

    try {
      const response = await chatWithDemandAgent(
        token,
        nextMessages.map((m) => ({
          role: m.role,
          content: m.content,
          images: m.images,
          videos: m.videos?.map((v) => v.url || v.name),
          documents: m.documents,
        })),
        {
          subject: demandSubject,
          format: selectedFormat || undefined,
          tagIds: selectedTagIds,
          dueDate: dueDate || undefined,
          referenceUrls: referenceUrls || undefined,
          requesterName: requesterName || undefined,
        },
      );

      if (response && response.reply) {
        const assistantMessage: MessageItem = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: response.reply,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Atualiza estado extraído
        if (response.updatedDemand) {
          const upd = response.updatedDemand;
          if (upd.subject && !demandSubject) setDemandSubject(upd.subject);
          if (upd.format && !selectedFormat) setSelectedFormat(upd.format);
          if (upd.dueDate && !dueDate) setDueDate(upd.dueDate);
          if (upd.referenceUrls) setReferenceUrls(upd.referenceUrls);
          if (upd.tagIds && upd.tagIds.length > 0) {
            setSelectedTagIds(Array.from(new Set([...selectedTagIds, ...upd.tagIds])));
          }
          if (upd.isReadyToConfirm) setIsReadyToConfirm(true);
        }
      }
    } catch (err: any) {
      const errorMessage: MessageItem = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `Ocorreu uma instabilidade momentânea na conexão: ${err?.message || "tente novamente"}.`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setSending(false);
    }
  }

  // Clique em um formato das pílulas visuais
  function handleSelectFormat(fmtId: string) {
    setSelectedFormat(fmtId);
    const fmt = FORMAT_OPTIONS.find((f) => f.id === fmtId);
    if (fmt) {
      void handleSend(`Formato selecionado: ${fmt.label}`);
    }
  }

  // Toggle de tag
  function handleToggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }

  // Enviar a demanda definitiva para o banco
  async function handleConfirmSubmit() {
    if (submitting) return;
    setSubmitting(true);

    try {
      // Coleta todos os anexos já enviados na conversa
      const allAttachments: { name: string; type: string; size: number; base64?: string }[] = [];
      messages.forEach((msg) => {
        if (msg.images) {
          msg.images.forEach((img, i) => {
            allAttachments.push({
              name: `imagem-referencia-${i + 1}.jpg`,
              type: "image/jpeg",
              size: 50000,
              base64: img,
            });
          });
        }
        if (msg.videos) {
          msg.videos.forEach((vid) => {
            if (vid.base64) {
              allAttachments.push({
                name: vid.name,
                type: "video/mp4",
                size: 200000,
                base64: vid.base64,
              });
            }
          });
        }
        if (msg.documents) {
          msg.documents.forEach((doc) => {
            allAttachments.push({
              name: doc.name,
              type: "application/pdf",
              size: doc.size,
              base64: doc.base64,
            });
          });
        }
      });

      // Também inclui arquivos que ainda estejam no composer
      attachedFiles.forEach((file) => {
        if (file.base64) {
          allAttachments.push({
            name: file.name,
            type: file.type,
            size: file.size,
            base64: file.base64,
          });
        }
      });

      const conversationSummary = messages
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .filter(Boolean)
        .join("\n\n");

      const res = await submitDemandViaLink(token, {
        title: demandSubject || `Demanda: ${selectedFormat || "Conteúdo"}`,
        subject: demandSubject,
        description: conversationSummary,
        demandFormat: selectedFormat || undefined,
        tagIds: selectedTagIds,
        dueDate: dueDate || undefined,
        referenceUrls: referenceUrls || undefined,
        requesterName: requesterName || undefined,
        requesterEmail: requesterEmail || undefined,
        attachments: allAttachments,
      });

      if (res.ok && res.demandCode) {
        setSubmittedCode(res.demandCode);
      }
    } catch (err: any) {
      alert(`Falha ao registrar demanda: ${err?.message || "Tente novamente."}`);
    } finally {
      setSubmitting(false);
    }
  }

  // Tela de Carregamento
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d0d] p-6 text-zinc-100">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-lg">
              <Sparkles className="h-6 w-6 animate-pulse" />
            </span>
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#0d0d0d]">
              <ShieldCheck className="h-2.5 w-2.5 text-white" />
            </span>
          </div>
          <p className="text-sm font-medium text-zinc-300">Verificando link de demanda...</p>
        </div>
      </div>
    );
  }

  // Tela de Erro de Verificação
  if (loadError || !linkInfo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d0d] p-6 text-zinc-100">
        <div className="w-full max-w-md rounded-3xl border border-red-500/20 bg-[#161616] p-6 text-center shadow-2xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white">Link Inválido ou Expirado</h2>
          <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
            {loadError || "Não foi possível verificar a autenticidade deste link de solicitação."}
          </p>
          <div className="mt-6 rounded-2xl border border-white/5 bg-white/5 p-3.5 text-left text-xs text-zinc-400">
            <p className="font-medium text-zinc-300">Como proceder:</p>
            <p className="mt-1">
              Peça ao administrador da conta que gere um novo <strong>Link Verificado</strong> na
              Central de Demandas do ASA.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Tela de Sucesso ao Registrar Demanda
  if (submittedCode) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d0d] p-6 text-zinc-100">
        <div className="w-full max-w-lg rounded-3xl border border-emerald-500/30 bg-[#161616] p-7 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 shadow-inner">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Demanda Registrada com Sucesso
          </span>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white">
            {demandSubject || "Demanda de Conteúdo"}
          </h1>

          <p className="mt-2 text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
            A equipe do projeto <strong>{linkInfo.project.name}</strong> já recebeu todas as suas
            orientações, arquivos e referências e iniciará a produção.
          </p>

          <div className="mt-6 flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Protocolo da Demanda:</span>
              <span className="font-mono font-semibold text-white bg-black/40 px-2.5 py-1 rounded-md">
                {submittedCode}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Projeto:</span>
              <span className="font-medium text-zinc-200">{linkInfo.project.name}</span>
            </div>
            {selectedFormat && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Formato:</span>
                <span className="font-medium text-sky-400 capitalize">
                  {FORMAT_OPTIONS.find((f) => f.id === selectedFormat)?.label || selectedFormat}
                </span>
              </div>
            )}
            {dueDate && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Prazo Desejado:</span>
                <span className="font-medium text-amber-400">{formatDay(dueDate)}</span>
              </div>
            )}
          </div>

          <div className="mt-7 flex items-center justify-center gap-3">
            <Button
              onClick={() => {
                setSubmittedCode(null);
                setDemandSubject("");
                setSelectedFormat(null);
                setSelectedTagIds([]);
                setDueDate("");
                setReferenceUrls("");
                setIsReadyToConfirm(false);
                setMessages([
                  {
                    id: `new-${Date.now()}`,
                    role: "assistant",
                    content: `Olá novamente! O que mais você gostaria de solicitar para o projeto **${linkInfo.project.name}**?`,
                    createdAt: new Date().toISOString(),
                  },
                ]);
              }}
              className="gap-2 rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-6 py-2.5 text-xs font-semibold text-white shadow-lg hover:opacity-95"
            >
              <Sparkles className="h-4 w-4" />
              Solicitar Outra Demanda
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // FORMAT_OPTIONS ativos
  const activeFormatObj = FORMAT_OPTIONS.find((f) => f.id === selectedFormat);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#0e0e0e] text-zinc-100 font-sans selection:bg-sky-500/30 selection:text-white">
      {/* 1. Header do Link Verificado */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#141414]/90 px-4 sm:px-6 backdrop-blur-md z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm text-white font-bold"
            style={{ backgroundColor: linkInfo.project.color || "#38bdf8" }}
          >
            {linkInfo.project.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-white truncate max-w-[160px] sm:max-w-[280px]">
                {linkInfo.project.name}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                <ShieldCheck className="h-3 w-3 shrink-0" />
                <span>Link Verificado</span>
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 truncate">
              {linkInfo.workspace.name} · Verificado por {linkInfo.verifiedBy.name}
            </span>
          </div>
        </div>

        {/* Status da Demanda no topo direito */}
        <div className="hidden sm:flex items-center gap-2">
          {activeFormatObj && (
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-sky-400">
              <activeFormatObj.icon className="h-3.5 w-3.5" />
              <span>{activeFormatObj.label}</span>
            </span>
          )}
          {dueDate && (
            <span className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
              <Calendar className="h-3.5 w-3.5 text-amber-400" />
              <span>Prazo: {formatDay(dueDate)}</span>
            </span>
          )}
        </div>
      </header>

      {/* 2. Área Central do Chat */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Thread com histórico de mensagens */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8 space-y-5">
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((msg) => {
              const isAssistant = msg.role === "assistant";
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3 text-sm transition-all animate-fadeIn",
                    isAssistant ? "justify-start" : "justify-end",
                  )}
                >
                  {isAssistant && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-md">
                      <Sparkles className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={cn(
                      "flex flex-col max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 leading-relaxed",
                      isAssistant
                        ? "bg-[#1c1c1c] text-zinc-200 border border-white/5 shadow-md"
                        : "bg-[#1d6eed] text-white shadow-md ml-auto",
                    )}
                  >
                    {/* Texto da mensagem */}
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* Imagens Anexadas */}
                    {msg.images && msg.images.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {msg.images.map((img, i) => (
                          <div
                            key={i}
                            className="relative h-28 w-28 overflow-hidden rounded-xl border border-white/10 bg-black/40"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img}
                              alt="Anexo"
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Vídeos Anexados */}
                    {msg.videos && msg.videos.length > 0 && (
                      <div className="mt-2.5 space-y-1.5">
                        {msg.videos.map((vid, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 rounded-xl bg-black/30 px-3 py-1.5 text-xs text-pink-300 border border-pink-500/20"
                          >
                            <Film className="h-3.5 w-3.5 shrink-0 text-pink-400" />
                            <span className="truncate">{vid.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Documentos Anexados */}
                    {msg.documents && msg.documents.length > 0 && (
                      <div className="mt-2.5 space-y-1.5">
                        {msg.documents.map((doc, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 rounded-xl bg-black/30 px-3 py-1.5 text-xs text-red-300 border border-red-500/20"
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0 text-red-400" />
                            <span className="truncate">{doc.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Áudio Gravado */}
                    {msg.audio && (
                      <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-black/30 px-3 py-1.5 text-xs text-emerald-300 border border-emerald-500/20">
                        <Radio className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span>Mensagem de voz enviada</span>
                      </div>
                    )}
                  </div>

                  {!isAssistant && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white font-medium text-xs">
                      VC
                    </div>
                  )}
                </div>
              );
            })}

            {/* Indicador de Digitação do Agente */}
            {sending && (
              <div className="flex gap-3 text-sm animate-fadeIn">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-md">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl bg-[#1c1c1c] px-4 py-3 border border-white/5">
                  <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
                  <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse delay-150" />
                  <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse delay-300" />
                </div>
              </div>
            )}

            {/* Card Interativo de Revisão da Demanda (Exibido quando reunimos as informações) */}
            {isReadyToConfirm && (
              <div className="mt-4 rounded-3xl border border-sky-500/30 bg-[#161616] p-5 shadow-2xl animate-scaleUp">
                <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-sm font-semibold text-white">Resumo da Demanda Solicitada</h3>
                  </div>
                  <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300">
                    Pendente de Confirmação
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-zinc-400">Assunto / Tema:</span>
                    <input
                      type="text"
                      value={demandSubject}
                      onChange={(e) => setDemandSubject(e.target.value)}
                      placeholder="Ex: Campanha de Black Friday"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-sky-500 font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="text-zinc-400">Formato Escolhido:</span>
                      <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                        {activeFormatObj ? (
                          <>
                            <activeFormatObj.icon className={cn("h-4 w-4", activeFormatObj.color)} />
                            <span className="font-medium text-white">{activeFormatObj.label}</span>
                          </>
                        ) : (
                          <span className="text-zinc-500">Nenhum formato selecionado</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-zinc-400">Prazo de Entrega:</span>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  {/* Informações do Solicitante (opcional) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <span className="text-zinc-400">Seu Nome (opcional):</span>
                      <input
                        type="text"
                        value={requesterName}
                        onChange={(e) => setRequesterName(e.target.value)}
                        placeholder="Nome do solicitante"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <span className="text-zinc-400">Seu E-mail (opcional):</span>
                      <input
                        type="email"
                        value={requesterEmail}
                        onChange={(e) => setRequesterEmail(e.target.value)}
                        placeholder="email@empresa.com"
                        className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Botão de Confirmação Final */}
                <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                  <Button
                    onClick={handleConfirmSubmit}
                    disabled={submitting}
                    className="w-full sm:w-auto gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold shadow-lg hover:opacity-95 text-xs py-2.5 px-6 rounded-xl"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Enviando Demanda...</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        <span>Confirmar e Enviar Demanda</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            <div ref={threadEndRef} />
          </div>
        </div>

        {/* 3. Barra de Formatos e Tags (Idêntica à Imagem do Usuário) */}
        <div className="border-t border-white/10 bg-[#121212] px-4 py-3 sm:px-6 z-20">
          <div className="mx-auto max-w-3xl space-y-2.5">
            {/* Pílulas de Formatos Exatamente como no print */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <span className="hidden sm:inline-block text-[11px] font-medium text-zinc-400 shrink-0 mr-1">
                Formato:
              </span>
              {FORMAT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = selectedFormat === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectFormat(opt.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all shrink-0 cursor-pointer",
                      isSelected
                        ? opt.bgActive
                        : "border-white/10 bg-[#1f1f1f] text-zinc-300 hover:border-white/20 hover:bg-[#282828] hover:text-white",
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", opt.color)} />
                    <span>{opt.label}</span>
                    {isSelected && <Check className="h-3 w-3 shrink-0 ml-0.5 text-current" />}
                  </button>
                );
              })}
            </div>

            {/* Tags do Projeto Disponíveis */}
            {linkInfo.tags && linkInfo.tags.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                <span className="hidden sm:inline-block text-[10px] font-medium text-zinc-500 shrink-0 mr-1">
                  Tags:
                </span>
                {linkInfo.tags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleToggleTag(tag.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all shrink-0 cursor-pointer border",
                        isSelected
                          ? "border-sky-500/50 bg-sky-500/15 text-sky-300 shadow-2xs"
                          : "border-white/5 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200",
                      )}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: tag.color || "#38bdf8" }}
                      />
                      <span>{tag.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 4. Chat Composer para Envio de Textos, Dados, Imagens e Vídeos */}
        <div className="bg-[#121212] px-4 pb-4 sm:px-6">
          <div className="mx-auto max-w-3xl">
            {/* Input oculto para arquivos de imagem, vídeo e documentos */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="relative flex flex-col rounded-[24px] bg-[#212121] text-zinc-100 p-3 shadow-xl border border-white/10 transition-all">
              {/* Pré-visualização de Anexos no Composer */}
              {attachedFiles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2 px-1 pt-1">
                  {attachedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="group relative flex items-center gap-2 rounded-xl bg-[#171717] px-2.5 py-1.5 text-xs text-zinc-200 border border-white/10 shadow-xs"
                    >
                      {file.kind === "image" ? (
                        <div className="h-6 w-6 overflow-hidden rounded-md bg-black">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={file.previewUrl} alt="" className="h-full w-full object-cover" />
                        </div>
                      ) : file.kind === "video" ? (
                        <Film className="h-4 w-4 text-pink-400 shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-red-400 shrink-0" />
                      )}
                      <span className="truncate max-w-[140px] sm:max-w-[200px]">{file.name}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setAttachedFiles((prev) => prev.filter((item) => item.id !== file.id))
                        }
                        className="rounded-full p-0.5 text-zinc-400 hover:text-red-400 transition-colors"
                        aria-label="Remover anexo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Pré-visualização de Áudio Gravado */}
              {attachedAudio && !isRecording && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-[#171717] px-3 py-1.5 text-xs text-zinc-200 border border-emerald-500/20">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
                    <span>Mensagem de voz pronta ({attachedAudio.duration}s)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachedAudio(null)}
                    className="text-zinc-400 hover:text-red-400 transition-colors"
                    aria-label="Descartar áudio"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Barra Ativa de Gravação */}
              {isRecording ? (
                <div className="flex items-center justify-between gap-3 px-2 py-2">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                    </span>
                    <span className="text-xs font-medium text-white">
                      Gravando áudio... ({recordSeconds}s)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => stopRecording(false)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => stopRecording(true)}
                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black hover:bg-zinc-200"
                    >
                      Concluir
                    </button>
                  </div>
                </div>
              ) : (
                /* Textarea */
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={
                    !demandSubject
                      ? "Digite o assunto da demanda..."
                      : "Digite mais detalhes, briefing, referências..."
                  }
                  className="w-full resize-none bg-transparent text-white outline-none placeholder:text-zinc-500 text-[14px] leading-relaxed py-1 px-1 max-h-[180px] overflow-y-auto"
                />
              )}

              {/* Barra de Ações Inferior */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-1 text-zinc-400">
                  {/* Botão de Anexo Geral (Imagens, Vídeos, Documentos) */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Anexar imagens, vídeos ou documentos"
                    className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>

                  {/* Botão de Vídeo / Link do YouTube/Drive */}
                  <button
                    type="button"
                    onClick={() => setVideoUrlModalOpen(true)}
                    title="Adicionar link de vídeo (YouTube, Drive, Loom, Vimeo)"
                    className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 hover:text-pink-400 transition-colors"
                  >
                    <VideoIcon className="h-4 w-4" />
                  </button>

                  {/* Botão de Microfone / Áudio */}
                  <button
                    type="button"
                    onClick={startRecording}
                    title="Gravar mensagem de voz"
                    className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 hover:text-amber-400 transition-colors"
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                </div>

                {/* Botão de Ação Direita */}
                <div className="flex items-center gap-2">
                  {!isReadyToConfirm && demandSubject && (
                    <button
                      type="button"
                      onClick={() => setIsReadyToConfirm(true)}
                      className="hidden sm:inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-white/20 hover:text-white transition-colors"
                    >
                      <span>Revisar Demanda</span>
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSend()}
                    disabled={sending || (!inputText.trim() && attachedFiles.length === 0 && !attachedAudio)}
                    aria-label="Enviar mensagem"
                    className="flex h-8.5 w-8.5 items-center justify-center rounded-full bg-[#1d6eed] text-white shadow-md hover:bg-[#2563eb] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ArrowUp className="h-4.5 w-4.5 stroke-[2.5]" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modal para Inserir Link de Vídeo Externo */}
      {videoUrlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1c1c1c] p-5 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Film className="h-4 w-4 text-pink-400" />
                <span>Link de Vídeo de Referência</span>
              </div>
              <button
                type="button"
                onClick={() => setVideoUrlModalOpen(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-xs text-zinc-400">
              Cole o link do YouTube, Google Drive, Vimeo ou Loom com as referências para o vídeo:
            </p>

            <input
              autoFocus
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={videoUrlInput}
              onChange={(e) => setVideoUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddVideoUrl();
              }}
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-pink-500"
            />

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setVideoUrlModalOpen(false)}
                className="text-xs"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAddVideoUrl}
                disabled={!videoUrlInput.trim()}
                className="text-xs bg-pink-600 hover:bg-pink-700 text-white"
              >
                Adicionar Vídeo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DemandRequestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0d0d0d] text-zinc-100">
          <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
        </div>
      }
    >
      <DemandChatContent />
    </Suspense>
  );
}
