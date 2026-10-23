"use client";

import { useEffect, useRef } from "react";

interface AudioWaveformVisualizerProps {
  stream: MediaStream | null;
  className?: string;
}

export function AudioWaveformVisualizer({
  stream,
  className,
}: AudioWaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let animationId: number;

    const historyBuffer: number[] = [];
    let lastSampleTime = 0;
    const SAMPLE_INTERVAL_MS = 38; // ~26 amostras por segundo para fluidez realista

    // Configuração do Web Audio API se houver stream ativo
    if (stream && stream.active) {
      try {
        const AudioCtxClass =
          window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          audioContext = new AudioCtxClass();
          if (audioContext.state === "suspended") {
            void audioContext.resume();
          }
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.65;
          sourceNode = audioContext.createMediaStreamSource(stream);
          sourceNode.connect(analyser);
        }
      } catch {
        // Fallback gracioso se permissão ou áudio falhar
      }
    }

    // Ajuste de DPI do Canvas
    function resizeCanvas() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    }

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);

    const freqData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    function render(currentTime: number) {
      if (!canvas || !ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const centerY = height / 2;

      // Detecta se está no modo escuro pela classe html ou atributo data-theme
      const isDark =
        document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark";

      // Cores conforme referência
      const dotColor = isDark ? "#48484a" : "#d1d5db";
      const waveColor = isDark ? "#d4d4d8" : "#4b5563";
      const peakColor = isDark ? "#ffffff" : "#18181b";

      // Parâmetros de espaçamento das barras e pontos
      const barWidth = 2.5;
      const barSpacing = 6.2;
      const numSlots = Math.max(10, Math.floor(width / barSpacing));

      // Garante tamanho do histórico correspondente à largura
      while (historyBuffer.length < numSlots) {
        historyBuffer.unshift(0);
      }
      if (historyBuffer.length > numSlots) {
        historyBuffer.splice(0, historyBuffer.length - numSlots);
      }

      // Amostragem de áudio no intervalo definido
      if (currentTime - lastSampleTime >= SAMPLE_INTERVAL_MS) {
        lastSampleTime = currentTime;
        let volume = 0;

        if (analyser && freqData) {
          analyser.getByteFrequencyData(freqData);
          // Amostra frequências vocais humanas (~85Hz a ~3500Hz)
          let sum = 0;
          let count = 0;
          for (let i = 1; i < Math.min(freqData.length, 28); i++) {
            sum += freqData[i];
            count++;
          }
          const avg = count > 0 ? sum / count : 0;
          // Normaliza eliminando ruído de fundo
          const raw = (avg - 14) / 125;
          volume = Math.max(0, Math.min(1, raw));
        } else {
          // Sutil pulso em repouso caso sem analyser
          volume = 0;
        }

        historyBuffer.push(volume);
        if (historyBuffer.length > numSlots) {
          historyBuffer.shift();
        }
      }

      // Limpa canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.lineWidth = barWidth;
      ctx.lineCap = "round";

      const startX = (width - (numSlots - 1) * barSpacing) / 2;
      const maxHalfHeight = Math.max(8, centerY - 3);

      for (let i = 0; i < numSlots; i++) {
        const x = startX + i * barSpacing;
        const vol = historyBuffer[i] || 0;

        if (vol < 0.04) {
          // Ponto de silêncio (baseline pontilhada)
          ctx.strokeStyle = dotColor;
          ctx.beginPath();
          ctx.moveTo(x, centerY);
          ctx.lineTo(x, centerY);
          ctx.stroke();
        } else {
          // Barra de voz ativa expandida simetricamente
          const half = Math.max(1.5, vol * maxHalfHeight);
          ctx.strokeStyle = vol > 0.65 ? peakColor : waveColor;
          ctx.beginPath();
          ctx.moveTo(x, centerY - half);
          ctx.lineTo(x, centerY + half);
          ctx.stroke();
        }
      }

      ctx.restore();
      animationId = requestAnimationFrame(render);
    }

    animationId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      if (sourceNode) {
        sourceNode.disconnect();
      }
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close();
      }
    };
  }, [stream]);

  return (
    <canvas
      ref={canvasRef}
      className={className || "w-full h-8 block pointer-events-none"}
      style={{ display: "block" }}
    />
  );
}
