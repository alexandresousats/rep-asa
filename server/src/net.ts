import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message = "URL do agente não permitida.") {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

export function isBlockedIp(ip: string) {
  let value = ip.trim().toLowerCase();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  const zone = value.indexOf("%");
  if (zone !== -1) value = value.slice(0, zone);
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice("::ffff:".length);
    if (mapped.includes(".")) return isBlockedIp(mapped);
  }
  if (value === "::1" || value === "::" || value === "0.0.0.0") return true;
  if (value.includes(":")) {
    const head = value.split(":").find((part) => part.length > 0) ?? "0";
    const first = Number.parseInt(head, 16);
    if (!Number.isFinite(first)) return true;
    if (first >= 0xfe80 && first <= 0xfebf) return true;
    if ((first & 0xfe00) === 0xfc00) return true;
    return false;
  }
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  const nums = parts.map((part) => Number(part));
  if (nums.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = nums;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function blockedHostname(host: string) {
  const name = host.replace(/\.$/, "").toLowerCase();
  if (!name || BLOCKED_HOSTS.has(name)) return true;
  if (name.endsWith(".localhost") || name.endsWith(".local") || name.endsWith(".internal")) {
    return true;
  }
  if (/^\d+$/.test(name) || /^0x[0-9a-f]+$/i.test(name)) return true;
  return false;
}

export async function assertPublicHttpUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError();
  }
  if (url.username || url.password) throw new UnsafeUrlError();
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError();
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (blockedHostname(host)) throw new UnsafeUrlError();
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new UnsafeUrlError();
    return url;
  }
  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UnsafeUrlError("Não foi possível resolver o endereço do agente.");
  }
  if (records.length === 0 || records.some((record) => isBlockedIp(record.address))) {
    throw new UnsafeUrlError();
  }
  return url;
}
