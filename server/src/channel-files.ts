import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CHANNEL_FILE_LIMITS,
  CHANNEL_FILES_PER_MESSAGE,
  type ChannelFileKind,
} from "../../src/lib/channel-file-rules";
import { uid } from "./crypto";
import { prisma } from "./db";
import { ApiError } from "./errors";

const dir = path.join(process.cwd(), "server/data/channel-files");

export function channelFilePath(id: string) {
  if (!/^cf-[a-f0-9]+$/.test(id)) throw new ApiError(404, "Arquivo não encontrado.");
  return path.join(dir, id);
}

export type InspectedChannelFile = {
  name: string;
  mime: string;
  kind: ChannelFileKind;
  size: number;
  bytes: Buffer;
};

const KIND_LABEL: Record<ChannelFileKind, string> = {
  image: "A imagem",
  audio: "O áudio",
  video: "O vídeo",
  document: "O documento",
};

function startsWith(bytes: Buffer, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Buffer, start: number, length: number) {
  return bytes.subarray(start, start + length).toString("ascii");
}

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function safeName(raw: string, fallback: string) {
  const base = path.basename(raw).replace(/[\u0000-\u001F\u007F]/g, "").trim();
  const cleaned = base.replace(/[\\/]/g, "").slice(0, 120);
  return cleaned || fallback;
}

function officeMime(extension: string) {
  if (extension === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (extension === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (extension === "pptx") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  return null;
}

function limitMessage(kind: ChannelFileKind) {
  const max = CHANNEL_FILE_LIMITS[kind] / (1024 * 1024);
  return `${KIND_LABEL[kind]} passa de ${max} MB. O arquivo conta no armazenamento do espaço.`;
}

/** Identifica o arquivo pelo conteúdo, não pelo nome enviado pelo navegador. */
export function inspectChannelFile(bytes: Buffer, originalName: string): InspectedChannelFile {
  if (bytes.byteLength <= 0) throw new ApiError(400, "O arquivo está vazio.");
  const extension = extensionOf(originalName);
  let kind: ChannelFileKind | null = null;
  let mime = "application/octet-stream";
  let name = safeName(originalName, "arquivo");

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    kind = "image";
    mime = "image/jpeg";
    if (!/\.jpe?g$/i.test(name)) name = `${name.replace(/\.[^.]+$/, "")}.jpg`;
  } else if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    kind = "image";
    mime = "image/png";
  } else if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    kind = "image";
    mime = "image/gif";
  } else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    kind = "image";
    mime = "image/webp";
  } else if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") {
    kind = "audio";
    mime = "audio/wav";
  } else if (ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    kind = "audio";
    mime = "audio/mpeg";
  } else if (ascii(bytes, 0, 4) === "OggS") {
    kind = "audio";
    mime = "audio/ogg";
  } else if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (brand.startsWith("M4A") || brand === "M4B " || extension === "m4a") {
      kind = "audio";
      mime = "audio/mp4";
    } else {
      kind = "video";
      mime = brand.startsWith("qt") || extension === "mov" ? "video/quicktime" : "video/mp4";
    }
  } else if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
    kind = "video";
    mime = "video/webm";
  } else if (ascii(bytes, 0, 4) === "%PDF") {
    kind = "document";
    mime = "application/pdf";
  } else if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const office = officeMime(extension);
    if (!office) throw new ApiError(400, "Envie o documento como PDF, DOCX, XLSX ou PPTX.");
    kind = "document";
    mime = office;
  } else if (extension === "txt" && !bytes.includes(0) && bytes.byteLength <= 2 * 1024 * 1024) {
    kind = "document";
    mime = "text/plain; charset=utf-8";
  }

  if (!kind) {
    throw new ApiError(400, "Envie uma imagem, um áudio, um vídeo ou um documento (PDF, texto ou Office).");
  }
  if (bytes.byteLength > CHANNEL_FILE_LIMITS[kind]) {
    throw new ApiError(413, limitMessage(kind));
  }
  const canonical = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "application/pdf": "pdf",
    "text/plain; charset=utf-8": "txt",
  }[mime];
  if (canonical && !name.toLowerCase().endsWith(`.${canonical}`)) {
    name = `${name.replace(/\.[^.]+$/, "") || "arquivo"}.${canonical}`;
  }
  return { name, mime, kind, size: bytes.byteLength, bytes };
}

export function assertChannelFileCount(count: number) {
  if (count > CHANNEL_FILES_PER_MESSAGE) {
    throw new ApiError(400, "Uma mensagem aceita até 8 arquivos.");
  }
}

export async function writeChannelFiles(
  messageId: string,
  files: InspectedChannelFile[],
) {
  if (files.length === 0) return [];
  await mkdir(dir, { recursive: true });
  const rows = files.map((file) => ({ id: uid("cf"), ...file }));
  try {
    for (const file of rows) await writeFile(channelFilePath(file.id), file.bytes);
    await prisma.channelFile.createMany({
      data: rows.map((file) => ({
        id: file.id,
        messageId,
        name: file.name,
        mime: file.mime,
        kind: file.kind,
        size: file.size,
      })),
    });
  } catch (error) {
    await Promise.all(rows.map((file) => unlink(channelFilePath(file.id)).catch(() => undefined)));
    throw error;
  }
  return rows.map((file) => ({
    id: file.id,
    messageId,
    name: file.name,
    mime: file.mime,
    kind: file.kind,
    size: file.size,
    createdAt: new Date(),
  }));
}

export async function removeStoredChannelFiles(ids: string[]) {
  await Promise.all(ids.map((id) => unlink(channelFilePath(id)).catch(() => undefined)));
}

export function fileDisposition(file: { name: string; mime: string; kind: string }) {
  const inline =
    file.kind === "image" ||
    file.kind === "audio" ||
    file.kind === "video" ||
    file.mime === "application/pdf";
  const asciiName = file.name.replace(/["\r\n\\]/g, "").replace(/[^\x20-\x7E]/g, "_");
  const encoded = encodeURIComponent(file.name);
  return `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}

export function sliceFileRange(size: number, header: string | undefined) {
  if (!header) return { start: 0, end: Math.max(0, size - 1), status: 200 as const };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) throw new ApiError(416, "Intervalo inválido.");
  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) throw new ApiError(416, "Intervalo inválido.");
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Number(match[2]);
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) {
    throw new ApiError(416, "Intervalo inválido.");
  }
  return { start, end: Math.min(end, size - 1), status: 206 as const };
}
