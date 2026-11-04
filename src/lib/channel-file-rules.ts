export const CHANNEL_FILES_PER_MESSAGE = 8;

const MB = 1024 * 1024;

/** Limites por arquivo. O total continua no plano de armazenamento do espaço. */
export const CHANNEL_FILE_LIMITS = {
  image: 12 * MB,
  audio: 25 * MB,
  video: 80 * MB,
  document: 25 * MB,
} as const;

export type ChannelFileKind = keyof typeof CHANNEL_FILE_LIMITS;

const EXTENSIONS: Record<string, ChannelFileKind> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  ogg: "audio",
  mp4: "video",
  webm: "video",
  mov: "video",
  pdf: "document",
  txt: "document",
  docx: "document",
  xlsx: "document",
  pptx: "document",
};

export function channelFileKindFromName(name: string, mime = ""): ChannelFileKind | null {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (EXTENSIONS[extension]) return EXTENSIONS[extension];
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf" || mime.startsWith("text/")) return "document";
  return null;
}

export function channelFileLimitLabel(kind: ChannelFileKind) {
  const names = { image: "Imagens", audio: "Áudios", video: "Vídeos", document: "Documentos" };
  return `${names[kind]} até ${CHANNEL_FILE_LIMITS[kind] / MB} MB`;
}

/** Recusa no navegador antes do envio. O servidor confere o conteúdo de novo. */
export function clientFileIssue(file: { name: string; type: string; size: number }) {
  const kind = channelFileKindFromName(file.name, file.type);
  if (!kind) return "Envie uma imagem, um áudio, um vídeo ou um documento (PDF, texto ou Office).";
  if (file.size <= 0) return "O arquivo está vazio.";
  if (file.size > CHANNEL_FILE_LIMITS[kind]) {
    return `${channelFileLimitLabel(kind)}. Este arquivo entra no armazenamento do espaço.`;
  }
  return null;
}
