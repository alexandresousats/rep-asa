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

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins(),
  // pdf.js carrega o worker por um import relativo. Se o Next empacotar o
  // pacote, esse arquivo some e a leitura do PDF quebra no servidor.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
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
