import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { ApiError } from "./errors";

export const AGENT_URL_BLOCKED = "URL do agente não permitida.";

const block = new BlockList();
block.addSubnet("0.0.0.0", 8, "ipv4");
block.addSubnet("10.0.0.0", 8, "ipv4");
block.addSubnet("100.64.0.0", 10, "ipv4");
block.addSubnet("127.0.0.0", 8, "ipv4");
block.addSubnet("169.254.0.0", 16, "ipv4");
block.addSubnet("172.16.0.0", 12, "ipv4");
block.addSubnet("192.0.0.0", 24, "ipv4");
block.addSubnet("192.0.2.0", 24, "ipv4");
block.addSubnet("192.168.0.0", 16, "ipv4");
block.addSubnet("198.18.0.0", 15, "ipv4");
block.addSubnet("198.51.100.0", 24, "ipv4");
block.addSubnet("203.0.113.0", 24, "ipv4");
block.addSubnet("224.0.0.0", 4, "ipv4");
block.addSubnet("240.0.0.0", 4, "ipv4");
block.addAddress("255.255.255.255", "ipv4");
block.addAddress("::", "ipv6");
block.addAddress("::1", "ipv6");
// Não incluir ::ffff:0:0/96. O Node compara IPv4 com a forma mapeada,
// e esse prefixo bloquearia todo IPv4 público. Mapeado privado cai na regra IPv4.
block.addSubnet("fc00::", 7, "ipv6");
block.addSubnet("fe80::", 10, "ipv6");
block.addSubnet("fec0::", 10, "ipv6");
block.addSubnet("ff00::", 8, "ipv6");
block.addSubnet("2001:db8::", 32, "ipv6");

const METADATA_HOSTS = new Set(["metadata.google.internal", "metadata.goog"]);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

function denied(): never {
  throw new ApiError(400, AGENT_URL_BLOCKED);
}

function bareHost(hostname: string) {
  let host = hostname.trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (host.endsWith(".")) host = host.slice(0, -1);
  return host;
}

function blockedName(host: string) {
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  return METADATA_HOSTS.has(host);
}

function blockedAddress(address: string) {
  const version = isIP(address);
  if (version === 4) return block.check(address, "ipv4");
  if (version === 6) return block.check(address, "ipv6");
  return true;
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return denied();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") denied();
  if (url.username || url.password) denied();
  const host = bareHost(url.hostname);
  if (blockedName(host)) denied();
  if (isIP(host)) {
    if (blockedAddress(host)) denied();
    return url;
  }

  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    denied();
  }
  if (records.length === 0) denied();
  for (const record of records) {
    if (blockedAddress(record.address)) denied();
  }
  return url;
}

function toGet(headers: Headers) {
  headers.delete("content-type");
  headers.delete("content-length");
}

export async function fetchPublic(url: string, init: RequestInit = {}): Promise<Response> {
  let current = url;
  let method = (init.method ?? "GET").toUpperCase();
  let body = init.body;
  const headers = new Headers(init.headers);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHttpUrl(current);
    const response = await fetch(current, {
      ...init,
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
      redirect: "manual",
    });
    if (!REDIRECT_STATUSES.has(response.status)) return response;
    if (hop === MAX_REDIRECTS) {
      await response.body?.cancel().catch(() => undefined);
      throw new ApiError(502, "O provedor redirecionou vezes demais.");
    }
    const location = response.headers.get("location")?.trim();
    await response.body?.cancel().catch(() => undefined);
    if (!location) denied();
    let next: string;
    try {
      next = new URL(location, current).href;
    } catch {
      denied();
    }
    const origin = new URL(current).origin;
    const nextOrigin = new URL(next).origin;
    if (origin !== nextOrigin) headers.delete("authorization");
    if ((response.status === 301 || response.status === 302 || response.status === 303) && method !== "GET" && method !== "HEAD") {
      method = "GET";
      body = undefined;
      toGet(headers);
    }
    current = next;
  }
  denied();
}
