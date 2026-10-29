import type { Context } from "hono";
import { uid } from "./crypto";
import { prisma } from "./db";
import { ApiError } from "./errors";

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

function remoteAddress(c: Context) {
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string | null } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? "";
}

export function clientIp(c: Context) {
  const remote = remoteAddress(c).replace(/^::ffff:/, "");
  const loopback = remote === "127.0.0.1" || remote === "::1" || remote === "";
  if (loopback) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded.slice(0, 80);
  }
  return (remote || "unknown").slice(0, 80);
}

export async function assertRateLimit(key: string, limit: number, windowMs: number) {
  const bucket = key.slice(0, 200);
  const since = new Date(Date.now() - windowMs);
  await prisma.loginAttempt.deleteMany({
    where: { email: bucket, createdAt: { lte: since } },
  });
  const attempts = await prisma.loginAttempt.count({
    where: { email: bucket, createdAt: { gt: since } },
  });
  if (attempts >= limit) {
    throw new ApiError(429, "Muitas tentativas. Espere alguns minutos.");
  }
  await prisma.loginAttempt.create({ data: { id: uid("try"), email: bucket } });
}

export async function assertSignupRate(ip: string, email: string) {
  await assertRateLimit(`signup:ip:${ip}`, 5, FIFTEEN_MINUTES);
  await assertRateLimit(`signup:email:${email}`, 3, FIFTEEN_MINUTES);
}

export async function assertResetRate(ip: string, email: string) {
  await assertRateLimit(`reset:ip:${ip}`, 5, FIFTEEN_MINUTES);
  await assertRateLimit(`reset:email:${email}`, 3, ONE_HOUR);
}

export async function assertResetConfirmRate(ip: string) {
  await assertRateLimit(`reset-confirm:ip:${ip}`, 8, FIFTEEN_MINUTES);
}

export async function assertVerifyResendRate(ip: string, email: string) {
  await assertRateLimit(`verify:ip:${ip}`, 5, FIFTEEN_MINUTES);
  await assertRateLimit(`verify:email:${email}`, 3, ONE_HOUR);
}

export async function assertVerifyConfirmRate(ip: string) {
  await assertRateLimit(`verify-confirm:ip:${ip}`, 8, FIFTEEN_MINUTES);
}

export async function assertGoogleRate(ip: string) {
  await assertRateLimit(`google:ip:${ip}`, 20, FIFTEEN_MINUTES);
}

export async function assertDemandRate(ip: string, action: "info" | "chat" | "submit") {
  const limit = action === "submit" ? 10 : 30;
  await assertRateLimit(`demand:${action}:ip:${ip}`, limit, FIFTEEN_MINUTES);
}
