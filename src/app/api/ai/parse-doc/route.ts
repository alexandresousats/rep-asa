import { NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Suporte para arquivos grandes até 25MB
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Nenhum arquivo enviado." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          ok: false,
          error: `O arquivo excede o limite máximo de 25MB (tamanho: ${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
        },
        { status: 400 },
      );
    }

    const name = file.name;
    const size = file.size;
    const type = file.type || "application/octet-stream";
    const isPdf = type === "application/pdf" || name.toLowerCase().endsWith(".pdf");

    let text = "";
    let pageCount: number | undefined;

    if (isPdf) {
      const buffer = Buffer.from(await file.arrayBuffer());
      let parser: InstanceType<typeof PDFParse> | null = null;
      try {
        parser = new PDFParse({ data: buffer });
        const info = await parser.getInfo();
        pageCount = info?.total;
        const textResult = await parser.getText();
        text = textResult?.text || "";
        if (!pageCount && textResult?.total) {
          pageCount = textResult.total;
        }
      } catch (pdfErr: any) {
        return NextResponse.json(
          {
            ok: false,
            error: `Não foi possível extrair o texto do PDF: ${pdfErr?.message || "estrutura inválida"}`,
          },
          { status: 400 },
        );
      } finally {
        if (parser) {
          try {
            await parser.destroy();
          } catch {
            // ignore cleanup errors
          }
        }
      }
    } else {
      // Arquivos de texto (.txt, .csv, .md, .json, etc)
      text = await file.text();
    }

    // Se o texto for excessivamente longo para um único prompt (ex: mais de 150 mil caracteres),
    // limitamos preservando o início e adicionando aviso informativo.
    const MAX_CHARS = 150000;
    let truncated = false;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + "\n\n[... Restante do texto cortado para não estourar o limite de tokens da IA ...]";
      truncated = true;
    }

    return NextResponse.json({
      ok: true,
      name,
      size,
      type: isPdf ? "application/pdf" : type,
      pageCount,
      text,
      charCount: text.length,
      truncated,
    });
  } catch (err: any) {
    console.error("Erro ao analisar documento:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Erro ao processar o arquivo." },
      { status: 500 },
    );
  }
}
