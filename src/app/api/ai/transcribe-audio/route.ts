import { NextResponse } from "next/server";
import { assertPublicHttpUrl, UnsafeUrlError } from "../../../../../server/src/net";

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

    try {
      await assertPublicHttpUrl(whisperUrl);
    } catch (error) {
      const message =
        error instanceof UnsafeUrlError ? error.message : "URL do agente não permitida.";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }

    const whisperData = new FormData();
    whisperData.append("file", file);
    whisperData.append("model", "whisper-1");
    whisperData.append("language", "pt");

    const response = await fetch(whisperUrl, {
      method: "POST",
      redirect: "manual",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: whisperData,
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status >= 300 && response.status < 400) {
      return NextResponse.json(
        { ok: false, error: "O provedor redirecionou a requisição." },
        { status: 502 },
      );
    }

    const data = (await response.json().catch(() => null)) as { text?: string } | null;
    if (!response.ok) {
      console.error("[transcribe] provedor respondeu", response.status);
      return NextResponse.json({ ok: false, error: "Erro na transcrição." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, text: data?.text ?? "" });
  } catch (error) {
    console.error("[transcribe]", error);
    return NextResponse.json(
      { ok: false, error: "Falha interna ao transcrever áudio" },
      { status: 500 },
    );
  }
}
