import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, test } from "node:test";
import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { randomToken, sha256 } from "./crypto";
import { prisma } from "./db";
import type { Actor } from "./domain";
import { ApiError } from "./errors";
import { lockDelay, registerShareRoutes, shareIpHash } from "./share-links";

process.env.DEMAND_LINK_SECRET ||= "segredo-de-teste-com-mais-de-32-caracteres!!";
process.env.DODO_PAYMENTS_PRODUCT_ID ||= "prod_test";

const PIN = "5813";
const created = { userIds: [] as string[], workspaceId: "", ips: new Set<string>() };

after(async () => {
  if (created.workspaceId) {
    await prisma.workspace.delete({ where: { id: created.workspaceId } }).catch(() => undefined);
  }
  if (created.userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } }).catch(() => undefined);
  }
  const ips = [...created.ips];
  if (ips.length) {
    await prisma.loginAttempt
      .deleteMany({ where: { OR: ips.map((ip) => ({ email: { endsWith: `:${ip}` } })) } })
      .catch(() => undefined);
  }
  await prisma.$disconnect();
});

test("a espera do PIN cresce depois de cada bloqueio", () => {
  assert.equal(lockDelay(4, 5), 0);
  assert.equal(lockDelay(5, 5), 60_000);
  assert.equal(lockDelay(6, 5), 5 * 60_000);
  assert.equal(lockDelay(7, 5), 15 * 60_000);
  assert.equal(lockDelay(8, 5), 60 * 60_000);
  assert.equal(lockDelay(30, 5), 60 * 60_000);
});

test("link do cliente: bloqueio do PIN, alerta, auditoria, 401 e 429", async () => {
  const prefix = `sec${randomBytes(4).toString("hex")}`;
  const userId = `${prefix}-admin`;
  const editorId = `${prefix}-editor`;
  const workspaceId = `${prefix}-ws`;
  const projectId = `${prefix}-proj`;
  const taskId = `${prefix}-task`;
  const fileId = `${prefix}-file`;
  created.userIds.push(userId, editorId);
  created.workspaceId = workspaceId;
  const logs: string[] = [];
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const original = Object.fromEntries(methods.map((method) => [method, console[method]])) as Record<
    (typeof methods)[number],
    (...args: unknown[]) => void
  >;
  for (const method of methods) {
    console[method] = (...args: unknown[]) => {
      logs.push(args.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" "));
    };
  }

  try {
    for (const [id, access] of [
      [userId, "admin"],
      [editorId, "editor"],
    ] as const) {
      await prisma.user.create({
        data: {
          id,
          firstName: "Pessoa",
          lastName: "Teste",
          name: `Pessoa ${access}`,
          email: `${id}@example.com`,
          initials: "PT",
          role: "Time",
          access,
        },
      });
    }
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Espaço",
        members: {
          create: [
            { userId, access: "admin", status: "active", role: "Direção", owner: true },
            { userId: editorId, access: "editor", status: "active", role: "Time" },
          ],
        },
        subscription: {
          create: { status: "active", productId: process.env.DODO_PAYMENTS_PRODUCT_ID!.trim() },
        },
        projects: {
          create: {
            id: projectId,
            name: "Projeto",
            color: "#0284c7",
            description: "",
            ownerId: userId,
            createdAt: "2026-10-01",
          },
        },
      },
    });
    await prisma.task.create({
      data: {
        id: taskId,
        projectId,
        title: "Entrega",
        section: "Geral",
        dueDate: "2026-10-15",
        createdAt: "2026-10-01",
        attachments: { create: { id: fileId, name: "foto.png", mime: "image/png", size: 3 } },
      },
    });
    const privateToken = randomToken();
    const publicToken = randomToken();
    const linkId = `${prefix}-private`;
    const publicId = `${prefix}-public`;
    await prisma.clientShareLink.createMany({
      data: [
        {
          id: linkId,
          projectId,
          workspaceId,
          tokenHash: sha256(privateToken),
          label: "Cliente",
          createdById: userId,
          visibility: "private",
          pinHash: await bcrypt.hash(PIN, 10),
        },
        {
          id: publicId,
          projectId,
          workspaceId,
          tokenHash: sha256(publicToken),
          createdById: userId,
          visibility: "public",
        },
      ],
    });

    const admin: Actor = {
      id: userId,
      workspaceId,
      access: "admin",
      owner: true,
      firstName: "Pessoa",
      lastName: "Teste",
      name: "Pessoa admin",
      email: `${userId}@example.com`,
      phone: null,
      emailVerified: true,
      hasPassword: false,
      initials: "PT",
      role: "Direção",
      avatar: null,
      master: false,
      membershipStatus: "active",
      workspaceName: "Espaço",
    };
    let current = admin;
    const app = new Hono();
    app.onError((error, c) => {
      if (error instanceof ApiError) return c.json({ error: error.message }, error.status as 400);
      original.error(error);
      return c.json({ error: "Erro interno." }, 500);
    });
    registerShareRoutes(app, { actorOf: async () => current });

    let ipSeed = 0;
    const newIp = () => {
      ipSeed += 1;
      const ip = `198.51.${Number.parseInt(prefix.slice(3, 5), 16)}.${ipSeed}`;
      created.ips.add(ip);
      return ip;
    };
    async function call(method: string, url: string, ip: string, options: { body?: unknown; cookie?: string } = {}) {
      const headers: Record<string, string> = { "x-forwarded-for": ip };
      if (options.body !== undefined) headers["content-type"] = "application/json";
      if (options.cookie) headers.cookie = options.cookie;
      const res = await app.request(
        url,
        { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) },
        { incoming: { socket: { remoteAddress: "127.0.0.1" } } },
      );
      const text = await res.text();
      const json = text && (res.headers.get("content-type") ?? "").includes("json") ? JSON.parse(text) : null;
      return { status: res.status, text, json, headers: res.headers };
    }
    const unlock = (ip: string, pin: string, token = privateToken) =>
      call("POST", `/public/share/${token}/unlock`, ip, { body: { pin } });

    // Sem sessão, um link privado não entrega nada além do pedido de PIN.
    const ipA = newIp();
    const base = `/public/share/${privateToken}`;
    for (const [method, path] of [
      ["GET", "/tasks"],
      ["GET", `/tasks/${taskId}`],
      ["GET", "/summary?month=2026-10"],
      ["GET", `/tasks/${taskId}/attachments/${fileId}`],
      ["GET", `/tasks/${taskId}/attachments/${fileId}/preview`],
      ["POST", `/tasks/${taskId}/approve`],
      ["POST", `/tasks/${taskId}/request-changes`],
    ] as const) {
      const res = await call(method, `${base}${path}`, ipA, {
        body: method === "POST" ? { clientName: "Cliente", message: "x" } : undefined,
      });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
    const overview = await call("GET", base, ipA);
    assert.equal(overview.json?.requiresPin, true);
    assert.equal(overview.json?.project, undefined);

    // 5 erros seguidos do mesmo IP travam o unlock, até com o PIN certo.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await unlock(ipA, "0000")).status, 401);
    }
    const locked = await unlock(ipA, PIN);
    assert.equal(locked.status, 429);
    assert.match(locked.json?.error, /1 minuto/);
    assert.equal(locked.headers.get("set-cookie"), null);

    // Outro IP não é afetado e o acerto libera a sessão.
    const ipB = newIp();
    const okB = await unlock(ipB, PIN);
    assert.equal(okB.status, 200);
    assert.match(okB.headers.get("set-cookie") ?? "", /asa_share=/);

    // Passada a espera, o próximo erro trava por mais tempo.
    await prisma.shareLinkEvent.updateMany({
      where: { linkId, ipHash: shareIpHash(ipA) },
      data: { createdAt: new Date(Date.now() - 2 * 60_000) },
    });
    assert.equal((await unlock(ipA, "1111")).status, 401);
    const longer = await unlock(ipA, PIN);
    assert.equal(longer.status, 429);
    assert.match(longer.json?.error, /5 minutos/);

    // O acerto zera o contador do IP.
    await prisma.shareLinkEvent.updateMany({
      where: { linkId, ipHash: shareIpHash(ipA) },
      data: { createdAt: new Date(Date.now() - 10 * 60_000) },
    });
    assert.equal((await unlock(ipA, PIN)).status, 200);
    assert.equal((await unlock(ipA, "2222")).status, 401);
    assert.equal((await unlock(ipA, PIN)).status, 200);

    // 15 erros no link, cada um de um IP, travam o link para qualquer IP.
    for (let attempt = 0; attempt < 15; attempt += 1) {
      assert.equal((await unlock(newIp(), "3333")).status, 401);
    }
    const otherIp = newIp();
    assert.equal((await unlock(otherIp, PIN)).status, 429);

    // Com 20 tentativas ruins na hora, os admins recebem um alerta, e só um.
    const alerts = () =>
      prisma.notification.findMany({ where: { userId, type: "share_pin_alert" } });
    while ((await alerts()).length === 0) {
      const res = await unlock(newIp(), "4444");
      assert.ok([401, 429].includes(res.status));
      if (ipSeed > 40) break;
    }
    const sent = await alerts();
    assert.equal(sent.length, 1);
    assert.match(sent[0].body, /Considere trocar o PIN/);
    assert.equal(sent[0].href, `/projetos/${projectId}?compartilhar=${linkId}`);
    await unlock(newIp(), "4444");
    assert.equal((await alerts()).length, 1);
    assert.equal(
      await prisma.notification.count({ where: { userId: editorId, type: "share_pin_alert" } }),
      0,
    );

    // Auditoria: só o admin vê, com o visitante identificado por um hash curto.
    const activity = await call("GET", `/projects/${projectId}/share-links/${linkId}/activity`, ipA);
    assert.equal(activity.status, 200);
    const kinds = new Set((activity.json as { kind: string }[]).map((item) => item.kind));
    for (const kind of ["unlock_ok", "unlock_fail", "unlock_blocked"]) assert.ok(kinds.has(kind), kind);
    assert.equal(activity.text.includes(shareIpHash(ipA)), false);
    assert.equal(activity.text.includes(ipA), false);
    current = { ...admin, id: editorId, access: "editor", owner: false };
    assert.equal(
      (await call("GET", `/projects/${projectId}/share-links/${linkId}/activity`, ipA)).status,
      403,
    );
    current = admin;

    // Rate limit: leitura e escrita respondem 429 quando o IP passa do limite.
    const busyIp = newIp();
    await prisma.loginAttempt.createMany({
      data: Array.from({ length: 120 }, (_, index) => ({
        id: `${prefix}-r${index}`,
        email: `share:ip:${busyIp}`,
      })),
    });
    assert.equal((await call("GET", `/public/share/${publicToken}`, busyIp)).status, 429);
    const writer = newIp();
    await prisma.loginAttempt.createMany({
      data: Array.from({ length: 20 }, (_, index) => ({
        id: `${prefix}-w${index}`,
        email: `share:write:ip:${writer}`,
      })),
    });
    const throttled = await call("POST", `/public/share/${publicToken}/tasks/${taskId}/approve`, writer, {
      body: { clientName: "Cliente" },
    });
    assert.equal(throttled.status, 429);
    assert.equal(await prisma.clientFeedback.count({ where: { taskId } }), 0);

    // O PIN nunca aparece nos logs nem fica salvo em texto.
    assert.equal(logs.some((line) => line.includes(PIN)), false);
    const events = await prisma.shareLinkEvent.findMany({ where: { linkId } });
    assert.equal(JSON.stringify(events).includes(PIN), false);
  } finally {
    for (const method of methods) console[method] = original[method];
  }
});
