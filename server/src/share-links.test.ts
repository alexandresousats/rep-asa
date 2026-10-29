import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import bcrypt from "bcryptjs";
import { Hono } from "hono";
import { sha256 } from "./crypto";
import { prisma } from "./db";
import type { Actor } from "./domain";
import { ApiError } from "./errors";
import { assertRateLimit } from "./rate-limit";
import { isPublicSharePath, registerShareRoutes, shareCookieOptions, toPublicTask } from "./share-links";

process.env.DATABASE_URL ??= "postgresql://asa:asa@127.0.0.1:5433/asa";
process.env.DEMAND_LINK_SECRET ??= "test-secret-test-secret-test-secret-12";
if (!process.env.DODO_PAYMENTS_PRODUCT_ID?.trim()) {
  process.env.DODO_PAYMENTS_PRODUCT_ID = "pdt_share_test";
}

const SECRET = "SEGREDO9F3A";
const FORBIDDEN_KEYS = new Set([
  "assignee",
  "assigneeId",
  "approvedBy",
  "approvedById",
  "followers",
  "followerIds",
  "children",
  "subtasks",
  "parentId",
  "comments",
  "comment",
  "dependencies",
  "blockedBy",
  "blocking",
  "customFields",
  "externalId",
  "priority",
  "email",
  "userId",
  "authorId",
  "ownerId",
  "memberIds",
  "pin",
  "pinHash",
  "token",
  "tokenHash",
  "password",
  "passwordHash",
  "approvalFeedback",
  "approvedAt",
  "sessionVersion",
  "createdById",
]);

const created = {
  userId: "",
  workspaceId: "",
  files: [] as string[],
  rateKeys: [] as string[],
};

after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (created.workspaceId) {
    await prisma.workspace.delete({ where: { id: created.workspaceId } }).catch(() => undefined);
  }
  if (created.userId) {
    await prisma.user.delete({ where: { id: created.userId } }).catch(() => undefined);
  }
  await Promise.all(created.files.map((file) => unlink(file).catch(() => undefined)));
  if (created.rateKeys.length) {
    await prisma.loginAttempt.deleteMany({ where: { email: { in: created.rateKeys } } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

test("a rota pública do link não passa pela sessão do app", () => {
  assert.equal(isPublicSharePath("/public/share/abc"), true);
  assert.equal(isPublicSharePath("/public/share/abc/tasks"), true);
  assert.equal(isPublicSharePath("/projects/p/share-links"), false);
  assert.equal(isPublicSharePath("/demands/link-info"), false);
});

test("o cookie do PIN é httpOnly, Secure em produção e restrito ao link", () => {
  const previous = process.env.COOKIE_SECURE;
  process.env.COOKIE_SECURE = "1";
  try {
    const options = shareCookieOptions("tok_abc");
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, "Lax");
    assert.equal(options.secure, true);
    assert.equal(options.path, "/public/share/tok_abc");
    assert.equal(options.maxAge, 12 * 60 * 60);
  } finally {
    if (previous === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = previous;
  }
});

test("o DTO público não carrega campos internos", () => {
  const dto = toPublicTask({
    id: "task-visivel",
    title: "Entrega",
    description: `<p>Texto visivel</p><script>alert("${SECRET}")</script>`,
    startDate: "2026-10-10",
    dueDate: "2026-10-15",
    status: "doing",
    section: "Geral",
    approvalStatus: "pending",
    isDemand: true,
    demandFormat: "Reels",
    referenceUrls: "https://example.com/ref",
    tags: [{ tag: { name: "Reels", color: "#ec4899" } }],
    attachments: [{ id: "file-1", name: "foto.png", mime: "image/png", size: 3 }],
  });
  assert.deepEqual(Object.keys(dto).sort(), [
    "approvalStatus",
    "attachments",
    "demandFormat",
    "description",
    "dueDate",
    "id",
    "isDemand",
    "referenceUrls",
    "section",
    "startDate",
    "status",
    "tags",
    "title",
  ]);
  assert.equal(JSON.stringify(dto).includes(SECRET), false);
  assert.equal(dto.description.includes("script"), false);
  assert.match(dto.description, /Texto visivel/);
});

function keysOf(value: unknown, found: string[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, found);
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      found.push(key);
      keysOf(child, found);
    }
  }
  return found;
}

function assertNoSecrets(json: unknown, text: string) {
  for (const key of keysOf(json)) {
    assert.equal(FORBIDDEN_KEYS.has(key), false, key);
  }
  assert.equal(text.includes(SECRET), false);
}

test("link de calendário: token, PIN, DTO filtrado e sessões", async () => {
  const prefix = `slt${randomBytes(4).toString("hex")}`;
  const userId = `${prefix}-user-${SECRET}`;
  const workspaceId = `${prefix}-ws-${SECRET}`;
  const projectId = `${prefix}-proj-${SECRET}`;
  const otherProjectId = `${prefix}-other-${SECRET}`;
  const taskId = `${prefix}-task`;
  const outsideId = `${prefix}-outside`;
  const subtaskId = `${prefix}-sub`;
  const otherTaskId = `${prefix}-other-task`;
  const fileId = `${prefix}-file`;
  const otherFileId = `${prefix}-other-file`;
  const pin = "7482";
  const nextPin = "9156";
  const productId = process.env.DODO_PAYMENTS_PRODUCT_ID!.trim();
  const logs: string[] = [];
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const original = Object.fromEntries(methods.map((method) => [method, console[method]])) as Record<
    (typeof methods)[number],
    (...args: unknown[]) => void
  >;
  for (const method of methods) {
    console[method] = (...args: unknown[]) => {
      logs.push(args.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" "));
      original[method](...args);
    };
  }

  created.userId = userId;
  created.workspaceId = workspaceId;

  try {
    await prisma.user.create({
      data: {
        id: userId,
        firstName: "Ana",
        lastName: "Teste",
        name: "Ana Teste",
        email: `${prefix}.${SECRET}@example.com`,
        initials: "AT",
        role: "Direção",
        access: "admin",
      },
    });
    await prisma.workspace.create({
      data: {
        id: workspaceId,
        name: "Espaço do cliente",
        logo: "https://example.com/logo.png",
        members: {
          create: {
            userId,
            access: "admin",
            status: "active",
            role: "Direção",
            owner: true,
            acceptedAt: new Date(),
          },
        },
        subscription: { create: { status: "active", productId } },
        projects: {
          create: [
            {
              id: projectId,
              name: "Projeto visível",
              color: "#0284c7",
              description: `descricao ${SECRET}`,
              ownerId: userId,
              createdAt: "2026-10-01",
            },
            {
              id: otherProjectId,
              name: "Outro projeto",
              color: "#000000",
              description: "",
              ownerId: userId,
              createdAt: "2026-10-01",
            },
          ],
        },
      },
    });
    const tagId = `${prefix}-tag-${SECRET}`;
    await prisma.tag.create({
      data: { id: tagId, name: "Reels", color: "#ec4899", workspaceId },
    });
    await prisma.task.create({
      data: {
        id: taskId,
        projectId,
        title: "Entrega visível",
        description: `<p>Texto visivel do cliente</p><script>${SECRET}</script>`,
        assigneeId: userId,
        dueDate: "2026-10-15",
        startDate: "2026-10-10",
        priority: "urgente",
        status: "doing",
        section: "Geral",
        createdAt: "2026-10-01",
        externalId: `ext-${SECRET}`,
        customFields: { segredo: SECRET },
        isDemand: true,
        demandFormat: "Reels",
        referenceUrls: "https://example.com/ref",
        approvalStatus: "pending",
        approvalFeedback: `parecer ${SECRET}`,
        approvedAt: "2026-10-12",
        approvedById: userId,
        comments: {
          create: {
            id: `${prefix}-comment`,
            authorId: userId,
            body: `nota ${SECRET}`,
            createdAt: "2026-10-02",
          },
        },
        followers: { create: { userId } },
        tags: { create: { tagId } },
      },
    });
    await prisma.task.create({
      data: {
        id: outsideId,
        projectId,
        title: "Fora do mês",
        section: "Geral",
        dueDate: "2026-12-01",
        createdAt: "2026-10-01",
      },
    });
    await prisma.taskDependency.create({ data: { blockerId: outsideId, blockedId: taskId } });
    await prisma.task.create({
      data: {
        id: subtaskId,
        projectId,
        parentId: taskId,
        title: `subtarefa ${SECRET}`,
        section: "Geral",
        dueDate: "2026-10-15",
        createdAt: "2026-10-01",
      },
    });
    await prisma.task.create({
      data: {
        id: otherTaskId,
        projectId: otherProjectId,
        title: `tarefa ${SECRET}`,
        section: "Geral",
        dueDate: "2026-10-15",
        createdAt: "2026-10-01",
      },
    });
    await prisma.attachment.createMany({
      data: [
        { id: fileId, taskId, name: "foto.png", mime: "image/png", size: 3 },
        { id: otherFileId, taskId: outsideId, name: "outro.txt", mime: "text/plain", size: 1 },
      ],
    });
    const dir = path.join(process.cwd(), "server/data/attachments");
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, fileId);
    await writeFile(filePath, Buffer.from("png"));
    created.files.push(filePath);

    const actor: Actor = {
      id: userId,
      workspaceId,
      access: "admin",
      owner: true,
      firstName: "Ana",
      lastName: "Teste",
      name: "Ana Teste",
      email: `${prefix}.${SECRET}@example.com`,
      phone: null,
      emailVerified: true,
      hasPassword: false,
      initials: "AT",
      role: "Direção",
      avatar: null,
      master: false,
      membershipStatus: "active",
      workspaceName: "Espaço do cliente",
    };
    const editor: Actor = { ...actor, access: "editor", owner: false };
    let current = actor;
    const app = new Hono();
    app.onError((error, c) => {
      if (error instanceof ApiError) return c.json({ error: error.message }, error.status as 400);
      console.error(error);
      return c.json({ error: "Erro interno." }, 500);
    });
    registerShareRoutes(app, { actorOf: async () => current });

    const ipKey = "share:ip:203.0.113.44";
    created.rateKeys.push(ipKey);

    async function call(
      method: string,
      url: string,
      options: { body?: unknown; cookie?: string } = {},
    ) {
      const headers: Record<string, string> = { "x-forwarded-for": "203.0.113.44" };
      if (options.body !== undefined) headers["content-type"] = "application/json";
      if (options.cookie) headers.cookie = options.cookie;
      const res = await app.request(
        url,
        {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        },
        { incoming: { socket: { remoteAddress: "127.0.0.1" } } },
      );
      const text = await res.text();
      const type = res.headers.get("content-type") ?? "";
      const json = type.includes("json") && text ? (JSON.parse(text) as Record<string, unknown>) : null;
      return { status: res.status, text, json, headers: res.headers };
    }

    current = editor;
    const forbidden = await call("POST", `/projects/${projectId}/share-links`, {
      body: { visibility: "private", pin },
    });
    assert.equal(forbidden.status, 403);
    current = actor;

    const missingPin = await call("POST", `/projects/${projectId}/share-links`, {
      body: { visibility: "private", label: "Cliente" },
    });
    assert.equal(missingPin.status, 400);

    const createdLink = await call("POST", `/projects/${projectId}/share-links`, {
      body: { visibility: "private", pin, label: "Cliente", expiresAt: null },
    });
    assert.equal(createdLink.status, 201);
    const token = String(createdLink.json?.token);
    const linkId = String(createdLink.json?.id);
    assert.ok(Buffer.from(token, "base64url").length >= 32);
    assert.equal(createdLink.json?.hasPin, true);
    assert.equal(JSON.stringify(createdLink.json).includes(pin), false);
    assert.equal(Object.hasOwn(createdLink.json ?? {}, "pinHash"), false);
    assert.equal(Object.hasOwn(createdLink.json ?? {}, "tokenHash"), false);
    created.rateKeys.push(`share:token:${sha256(token)}`);

    const row = await prisma.clientShareLink.findUniqueOrThrow({ where: { id: linkId } });
    assert.equal(row.tokenHash, sha256(token));
    assert.notEqual(row.tokenHash, token);
    assert.ok(row.pinHash?.startsWith("$2"));
    assert.notEqual(row.pinHash, pin);
    assert.equal(await bcrypt.compare(pin, row.pinHash!), true);
    const stored = JSON.stringify({ ...row, pinHash: null, tokenHash: null });
    assert.equal(stored.includes(pin), false);
    assert.equal(stored.includes(token), false);

    const listed = await call("GET", `/projects/${projectId}/share-links`);
    assert.equal(listed.status, 200);
    assert.equal(JSON.stringify(listed.json).includes(token), false);
    assert.equal(JSON.stringify(listed.json).includes(pin), false);

    current = editor;
    const linkPath = `/projects/${projectId}/share-links/${linkId}`;
    for (const [method, url, body] of [
      ["GET", `/projects/${projectId}/share-links`, undefined],
      ["PATCH", linkPath, { label: "Outro" }],
      ["POST", `${linkPath}/revoke`, undefined],
      ["POST", `${linkPath}/regenerate`, undefined],
    ] as const) {
      assert.equal((await call(method, url, { body })).status, 403, `${method} ${url}`);
    }
    current = actor;

    const locked = await call("GET", `/public/share/${token}`);
    assert.equal(locked.status, 200);
    assert.deepEqual(locked.json, { requiresPin: true });
    assertNoSecrets(locked.json, locked.text);

    const lockedTasks = await call("GET", `/public/share/${token}/tasks`);
    assert.equal(lockedTasks.status, 401);
    const lockedDetail = await call("GET", `/public/share/${token}/tasks/${taskId}`);
    assert.equal(lockedDetail.status, 401);
    const lockedFile = await call(
      "GET",
      `/public/share/${token}/tasks/${taskId}/attachments/${fileId}`,
    );
    assert.equal(lockedFile.status, 401);

    const wrongPin = await call("POST", `/public/share/${token}/unlock`, { body: { pin: "0000" } });
    assert.equal(wrongPin.status, 401);
    assert.equal(wrongPin.json?.error, "Não foi possível liberar o link.");
    assert.equal((wrongPin.headers.get("set-cookie") ?? "").includes(pin), false);

    const previousSecure = process.env.COOKIE_SECURE;
    process.env.COOKIE_SECURE = "1";
    const unlocked = await call("POST", `/public/share/${token}/unlock`, { body: { pin } });
    if (previousSecure === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = previousSecure;
    assert.equal(unlocked.status, 200);
    assert.deepEqual(unlocked.json, { ok: true });
    const setCookie = unlocked.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.match(setCookie, /Max-Age=43200/);
    assert.match(setCookie, new RegExp(`Path=/public/share/${token}`));
    assert.equal(setCookie.includes(pin), false);
    const cookie = setCookie.split(";")[0];
    const payload = JSON.parse(
      Buffer.from(decodeURIComponent(cookie.split("=").slice(1).join("=")).split(".")[0], "base64url").toString(
        "utf8",
      ),
    ) as { linkId?: string; v?: number; pin?: string; token?: string };
    assert.equal(payload.linkId, linkId);
    assert.equal(payload.v, 0);
    assert.equal(payload.pin, undefined);
    assert.equal(payload.token, undefined);

    const overview = await call("GET", `/public/share/${token}`, { cookie });
    assert.equal(overview.status, 200);
    assert.deepEqual(overview.json, {
      project: { name: "Projeto visível", color: "#0284c7" },
      workspace: { name: "Espaço do cliente", logo: "https://example.com/logo.png" },
    });
    assertNoSecrets(overview.json, overview.text);

    const tasks = await call("GET", `/public/share/${token}/tasks?from=2026-10-01&to=2026-10-31`, {
      cookie,
    });
    assert.equal(tasks.status, 200);
    assertNoSecrets(tasks.json, tasks.text);
    const titles = (tasks.json?.tasks as { title: string }[]).map((item) => item.title);
    assert.deepEqual(titles, ["Entrega visível"]);
    assert.equal(tasks.text.includes("Fora do mês"), false);
    assert.equal(tasks.text.includes("<script"), false);
    assert.match(tasks.text, /Texto visivel do cliente/);

    const detail = await call("GET", `/public/share/${token}/tasks/${taskId}`, { cookie });
    assert.equal(detail.status, 200);
    assertNoSecrets(detail.json, detail.text);
    assert.equal(detail.json?.approvalStatus, "pending");
    assert.deepEqual(detail.json?.tags, [{ name: "Reels", color: "#ec4899" }]);
    assert.deepEqual(detail.json?.attachments, [
      { id: fileId, name: "foto.png", mime: "image/png", size: 3 },
    ]);

    const subtask = await call("GET", `/public/share/${token}/tasks/${subtaskId}`, { cookie });
    assert.equal(subtask.status, 404);
    const foreign = await call("GET", `/public/share/${token}/tasks/${otherTaskId}`, { cookie });
    assert.equal(foreign.status, 404);

    const download = await call(
      "GET",
      `/public/share/${token}/tasks/${taskId}/attachments/${fileId}`,
      { cookie },
    );
    assert.equal(download.status, 200);
    assert.equal(download.text, "png");
    assert.match(download.headers.get("content-disposition") ?? "", /attachment/);
    const preview = await call(
      "GET",
      `/public/share/${token}/tasks/${taskId}/attachments/${fileId}/preview`,
      { cookie },
    );
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get("content-disposition") ?? "", /inline/);
    const wrongFile = await call(
      "GET",
      `/public/share/${token}/tasks/${taskId}/attachments/${otherFileId}`,
      { cookie },
    );
    assert.equal(wrongFile.status, 404);

    const madePublic = await call("PATCH", `/projects/${projectId}/share-links/${linkId}`, {
      body: { visibility: "public" },
    });
    assert.equal(madePublic.status, 200);
    const open = await call("GET", `/public/share/${token}/tasks`);
    assert.equal(open.status, 200);

    const madePrivate = await call("PATCH", `/projects/${projectId}/share-links/${linkId}`, {
      body: { visibility: "private" },
    });
    assert.equal(madePrivate.status, 200);
    const stale = await call("GET", `/public/share/${token}/tasks`, { cookie });
    assert.equal(stale.status, 401);
    const askPin = await call("GET", `/public/share/${token}`, { cookie });
    assert.deepEqual(askPin.json, { requiresPin: true });

    const changed = await call("PATCH", `/projects/${projectId}/share-links/${linkId}`, {
      body: { pin: nextPin },
    });
    assert.equal(changed.status, 200);
    assert.equal(JSON.stringify(changed.json).includes(nextPin), false);
    const afterPin = await prisma.clientShareLink.findUniqueOrThrow({ where: { id: linkId } });
    assert.ok(afterPin.sessionVersion >= 2);
    assert.equal(await bcrypt.compare(nextPin, afterPin.pinHash!), true);
    assert.equal(await bcrypt.compare(pin, afterPin.pinHash!), false);
    const dropped = await call("GET", `/public/share/${token}/tasks`, { cookie });
    assert.equal(dropped.status, 401);
    const oldPin = await call("POST", `/public/share/${token}/unlock`, { body: { pin } });
    assert.equal(oldPin.status, 401);
    const renewed = await call("POST", `/public/share/${token}/unlock`, { body: { pin: nextPin } });
    assert.equal(renewed.status, 200);
    const freshCookie = (renewed.headers.get("set-cookie") ?? "").split(";")[0];
    const stillOpen = await call("GET", `/public/share/${token}`, { cookie: freshCookie });
    assert.equal(stillOpen.status, 200);
    assert.equal(stillOpen.json?.project !== undefined, true);

    const regenerated = await call("POST", `/projects/${projectId}/share-links/${linkId}/regenerate`);
    assert.equal(regenerated.status, 200);
    const nextToken = String(regenerated.json?.token);
    assert.notEqual(nextToken, token);
    created.rateKeys.push(`share:token:${sha256(nextToken)}`);
    const oldUrl = await call("GET", `/public/share/${token}`);
    const missing = await call("GET", `/public/share/${"a".repeat(43)}`);
    const expiredLink = await call("POST", `/projects/${projectId}/share-links`, {
      body: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
    });
    const expiredToken = String(expiredLink.json?.token);
    created.rateKeys.push(`share:token:${sha256(expiredToken)}`);
    const expired = await call("GET", `/public/share/${expiredToken}`);
    const revokedLink = await call("POST", `/projects/${projectId}/share-links`, { body: {} });
    const revokedId = String(revokedLink.json?.id);
    const revokedToken = String(revokedLink.json?.token);
    created.rateKeys.push(`share:token:${sha256(revokedToken)}`);
    await call("POST", `/projects/${projectId}/share-links/${revokedId}/revoke`);
    const revoked = await call("GET", `/public/share/${revokedToken}`);
    assert.equal(oldUrl.status, 404);
    assert.equal(missing.status, 404);
    assert.equal(expired.status, 404);
    assert.equal(revoked.status, 404);
    assert.deepEqual(oldUrl.json, missing.json);
    assert.deepEqual(expired.json, missing.json);
    assert.deepEqual(revoked.json, missing.json);

    const revived = await call("GET", `/public/share/${nextToken}`);
    assert.deepEqual(revived.json, { requiresPin: true });

    await prisma.workspaceSubscription.update({
      where: { workspaceId },
      data: { status: "expired" },
    });
    const unavailable = await call("POST", `/public/share/${nextToken}/unlock`, { body: { pin: nextPin } });
    assert.equal(unavailable.status, 200);
    assert.deepEqual(unavailable.json, { unavailable: true });
    assert.equal(unavailable.text.includes("Projeto visível"), false);
    assertNoSecrets(unavailable.json, unavailable.text);
    await prisma.workspaceSubscription.update({
      where: { workspaceId },
      data: { status: "on_hold" },
    });
    const blocked = await call("GET", `/public/share/${nextToken}/tasks`);
    assert.deepEqual(blocked.json, { unavailable: true });
    assert.equal(blocked.text.includes("Entrega visível"), false);

    const attempts = await prisma.loginAttempt.findMany({
      where: { email: { contains: token } },
    });
    assert.equal(attempts.length, 0);
    const hashed = await prisma.loginAttempt.count({
      where: { email: `share:token:${sha256(token)}` },
    });
    assert.ok(hashed >= 1);

    const rateKey = `share-spec:${prefix}`;
    created.rateKeys.push(rateKey);
    await assertRateLimit(rateKey, 1, 60_000);
    await assert.rejects(
      () => assertRateLimit(rateKey, 1, 60_000),
      (error: unknown) => error instanceof ApiError && error.status === 429,
    );

    const blob = logs.join("\n");
    assert.equal(blob.includes(token), false);
    assert.equal(blob.includes(nextToken), false);
    assert.equal(blob.includes(pin), false);
    assert.equal(blob.includes(nextPin), false);

    const started = Date.now();
    while (Date.now() - started < 2000) {
      const fresh = await prisma.clientShareLink.findFirst({
        where: { tokenHash: sha256(nextToken) },
      });
      if ((fresh?.accessCount ?? 0) >= 1) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const counted = await prisma.clientShareLink.findFirstOrThrow({
      where: { tokenHash: sha256(nextToken) },
    });
    assert.ok(counted.accessCount >= 1);
  } finally {
    for (const method of methods) console[method] = original[method];
  }
});
