import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

function devOrigins() {
  const origins = new Set([
    "127.0.0.1",
    "localhost",
    "macbook-pro-de-alexandre.local",
  ]);
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      origins.add(entry.address);
    }
  }
  return [...origins];
}

function shareCsp() {
  // O Next injeta scripts inline sem nonce; em dev ele também precisa de eval.
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // Pré-visualização de vídeo e áudio anexados no chat de demanda.
    "media-src 'self' blob: data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins(),
  // pdf.js carrega o worker por um import relativo. Se o Next empacotar o
  // pacote, esse arquivo some e a leitura do PDF quebra no servidor.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  async headers() {
    // Página do link do cliente: fora dos buscadores, sem vazar o token no Referer.
    return [
      {
        source: "/c/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: shareCsp() },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/__/auth/action",
        destination: "/auth/acao",
      },
      {
        source: "/acctmgmt/__/auth/action",
        destination: "/auth/acao",
      },
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:4000/:path*",
      },
      {
        source: "/mcp",
        destination: "http://127.0.0.1:4000/mcp",
      },
      {
        source: "/opendata/:path*",
        destination: "http://127.0.0.1:8000/api/v1/:path*",
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
