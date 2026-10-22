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
  async rewrites() {
    return [
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
