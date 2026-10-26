"use client";

import { useState } from "react";
import { Logo } from "@/components/layout/logo";
import { Card } from "@/components/ui/card";
import { updateWorkspaceLogo } from "@/lib/api";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function WorkspaceLogoCard({
  logo,
  name,
}: {
  logo?: string | null;
  name: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type)) {
      setError("Envie uma imagem PNG, JPEG, WEBP ou GIF.");
      return;
    }
    if (file.size > 8_000_000) {
      setError("A imagem é grande demais.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await resizeLogo(file);
      const result = await updateWorkspaceLogo(next);
      setError(result.ok ? "" : result.error);
    } catch {
      setError("Não foi possível ler a imagem.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    const result = await updateWorkspaceLogo(null);
    setError(result.ok ? "" : result.error);
    setBusy(false);
  }

  return (
    <Card className="border-none">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-12 w-24 shrink-0 items-center">
          <Logo src={logo} alt={name} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">Logo da empresa</p>
          <p className="mt-1 text-sm text-faint">
            Aparece no topo da sidebar. Sem imagem, o logo do ASA continua no lugar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-xs text-ink hover:bg-hover">
            {busy ? "Salvando..." : logo ? "Trocar logo" : "Enviar logo"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onFile(file);
              }}
            />
          </label>
          {logo ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="rounded-full px-3 py-1.5 text-xs text-faint hover:text-ink disabled:opacity-40"
            >
              Usar logo do ASA
            </button>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
    </Card>
  );
}

function resizeLogo(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const max = 256;
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    image.src = url;
  });
}
