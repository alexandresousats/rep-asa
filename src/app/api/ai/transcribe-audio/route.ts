import { NextResponse } from "next/server";
import { ApiError } from "../../../../../server/src/errors";
import { fetchPublic } from "../../../../../server/src/net";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const apiKey = (formData.get("apiKey") as string | null) || "";
    const baseUrl = (formData.get("baseUrl") as string | null) || "https://api.openai.com/v1";

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "Nenhum arquivo de áudio enviado" },
        { status: 400 },
      );
    }

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Chave de API não informada" },
        { status: 400 },
      );
    }

    // Provedores que suportam endpoint OpenAI-compatible Whisper
    let whisperUrl = "";
    if (baseUrl.includes("api.groq.com")) {
      whisperUrl = "https://api.groq.com/openai/v1/audio/transcriptions";
    } else if (baseUrl.includes("api.openai.com")) {
      whisperUrl = "https://api.openai.com/v1/audio/transcriptions";
    } else if (!baseUrl.includes("api.x.ai")) {
      whisperUrl = `${baseUrl.replace(/\/+$/, "")}/audio/transcriptions`;
    }

    if (!whisperUrl) {
      return NextResponse.json(
        { ok: false, error: "Provedor configurado não possui endpoint de transcrição de áudio" },
        { status: 400 },
      );
    }

    const whisperData = new FormData();
    whisperData.append("file", file);
    whisperData.append("model", "whisper-1");
    whisperData.append("language", "pt");

    const response = await fetchPublic(whisperUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: whisperData,
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: data.error?.message || "Erro na transcrição Whisper" },
        { status: response.status },
      );
    }

    return NextResponse.json({ ok: true, text: data.text });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Falha interna ao transcrever áudio";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
