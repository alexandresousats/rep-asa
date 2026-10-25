import path from "node:path";
import { pathToFileURL } from "node:url";
import { NextResponse } from "next/server";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFParse } from "pdf-parse";

// Caminho montado em runtime. Um require.resolve estático é reescrito pelo
// Turbopack para um id virtual, e o pdf.js não consegue importar o worker.
const workerPath = path.join(
  process.cwd(),
  "node_modules",
  "pdfjs-dist",
  "legacy",
  "build",
  "pdf.worker.mjs",
);
const workerSrc = pathToFileURL(workerPath).href;
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
PDFParse.setWorker(workerSrc);

const MAX_PAGE_EDGE = 1400;
const JPEG_QUALITY = 70;

type PdfCanvas = {
  canvas: { toBuffer: (mime: string, quality: number) => Buffer };
  context: CanvasRenderingContext2D;
};

type PdfCanvasFactory = {
  create: (width: number, height: number) => PdfCanvas;
  destroy: (canvasAndContext: PdfCanvas) => void;
};

function meaningfulText(text: string) {
  return text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function needsPageImages(text: string, pageCount: number | undefined) {
  const readable = meaningfulText(text).length;
  const pages = pageCount ?? 1;
  return readable < 80 || (pages > 1 && readable < pages * 40);
}

async function renderPdfPages(data: Uint8Array) {
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const images: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const longest = Math.max(base.width, base.height);
      const scale = Math.min(2, MAX_PAGE_EDGE / longest);
      const viewport = page.getViewport({ scale });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));
      const fitted = page.getViewport({ scale: width / base.width });
      const canvasFactory = doc.canvasFactory as PdfCanvasFactory;
      const canvasAndContext = canvasFactory.create(width, height);
      try {
        await page.render({
          canvasContext: canvasAndContext.context,
          viewport: fitted,
          canvas: canvasAndContext.canvas as unknown as HTMLCanvasElement,
        }).promise;
        const jpeg = canvasAndContext.canvas.toBuffer("image/jpeg", JPEG_QUALITY);
        images.push(`data:image/jpeg;base64,${Buffer.from(jpeg).toString("base64")}`);
      } finally {
        canvasFactory.destroy(canvasAndContext);
        page.cleanup();
      }
    }
  } finally {
    await doc.destroy();
  }
  return images;
}

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
    let pageImages: string[] | undefined;

    if (isPdf) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let parser: InstanceType<typeof PDFParse> | null = null;
      try {
        parser = new PDFParse({ data: Buffer.from(bytes) });
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

      if (needsPageImages(text, pageCount)) {
        try {
          pageImages = await renderPdfPages(bytes);
        } catch (pdfErr: any) {
          return NextResponse.json(
            {
              ok: false,
              error: `Não foi possível ler as páginas do PDF: ${pdfErr?.message || "falha ao renderizar"}`,
            },
            { status: 400 },
          );
        }
        if (!meaningfulText(text)) {
          text =
            "Este PDF não tem texto selecionável. O conteúdo está nas imagens das páginas, na ordem.";
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
      pageImages,
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
