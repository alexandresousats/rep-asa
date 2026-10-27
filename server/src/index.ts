import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { stream, streamSSE } from "hono/streaming";
import { z } from "zod";
import { subscribe } from "./events";
import { normalizeConfig, runAgent, testAgent, type AgentEvent } from "./agent";
import { readWorkspaceAgent, saveWorkspaceAgent } from "./workspace-agent";
import {
  assertDemandLinkSecret,
  generateDemandLinkToken,
  processDemandChatTurn,
  submitDemandViaVerifiedLink,
  verifyDemandLinkToken,
} from "./demand-links";
import { exportWorkspaceCsv, importWorkspaceCsv, previewWorkspaceCsv } from "./backup";
import {
  actorFromApiKey,
  actorFromSession,
  acceptInvite,
  addAttachment,
  addComment,
  addMember,
  addProjectMember,
  addSubtask,
  bootstrap,
  confirmEmail,
  confirmReset,
  createApiKey,
  createProject,
  createWorkspace,
  deleteWorkspace,
  createSection,
  deleteSection,
  reorderSections,
  createTag,
  createTask,
  createThread,
  setTaskFollow,
  updateProject,
  declineInvite,
  deleteApiKey,
  rotateApiKey,
  deleteProject,
  deleteTag,
  deleteTask,
  destroySession,
  listApiKeys,
  listNotifications,
  login,
  loginWithGoogle,
  markAllNotificationsRead,
  markNotificationRead,
  readAttachment,
  removeAttachment,
  removeMember,
  renameSection,
  reorderTasks,
  requestReset,
  resendEmailConfirmation,
  selectWorkspace,
  sendMessage,
  signup,
  updateTag,
  updateTask,
  updateTaskApproval,
  updateUser,
  updateCurrentWorkspace,
} from "./domain";
import type { Actor } from "./domain";
import { sessionCookieSecure } from "./cookie";
import { hashesEqual, randomToken } from "./crypto";
import { firebaseIdentityProfile } from "./firebase-auth";
import { exchangeGoogleCode, googleAuthUrl, googleConfigured, googlePkce } from "./google";
import { appOrigin } from "./mail";
import { ApiError } from "./errors";
import {
  assertWorkspaceEntitled,
  billingSnapshot,
  changeBillingPeriod,
  changeSeats,
  createCheckout,
  createPortal,
  handleDodoWebhook,
  quoteSeats,
} from "./billing";
import { handleMcpMessage, rpcError } from "./mcp";
import {
  assertDemandRate,
  assertGoogleRate,
  assertResetConfirmRate,
  assertResetRate,
  assertSignupRate,
  assertVerifyConfirmRate,
  assertVerifyResendRate,
  clientIp,
} from "./rate-limit";

const access = z.enum(["admin", "editor", "leitura", "cliente"]);
const approvalStatus = z.enum(["none", "pending", "approved", "changes_requested"]);
const priority = z.enum(["baixa", "media", "alta", "urgente"]);
const status = z.enum(["todo", "doing", "done"]);

const agentConfig = z.object({
  baseUrl: z.string().max(300),
  apiKey: z.string().max(500),
  model: z.string().max(200),
});

const app = new Hono();

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: error.message }, error.status as 400);
  }
  console.error(error);
  return c.json({ error: "Erro interno." }, 500);
});

app.use(
  "/mcp",
  cors({
    origin: (origin) => {
      const allowed = new Set<string>();
      const appUrl = process.env.APP_URL?.replace(/\/$/, "");
      if (appUrl) allowed.add(appUrl);
      if (process.env.NODE_ENV !== "production") {
        allowed.add("http://localhost:3000");
        allowed.add("http://127.0.0.1:3000");
      }
      return allowed.has(origin) ? origin : null;
    },
    allowHeaders: ["Authorization", "Content-Type", "Accept", "Mcp-Protocol-Version"],
    exposeHeaders: ["Mcp-Protocol-Version"],
  }),
);

function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "Dados inválidos.");
  return result.data;
}

const COOKIE = "asa_session";
const WORKSPACE_COOKIE = "asa_workspace";
const OAUTH_STATE = "asa_oauth_state";
const OAUTH_VERIFIER = "asa_oauth_verifier";

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: sessionCookieSecure(),
    path: "/",
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}

function writeSession(c: Parameters<typeof setCookie>[0], token: string) {
  setCookie(c, COOKIE, token, cookieOptions(60 * 60 * 24 * 30));
}

function writeWorkspace(c: Parameters<typeof setCookie>[0], workspaceId: string | null) {
  if (!workspaceId) {
    deleteCookie(c, WORKSPACE_COOKIE, cookieOptions());
    return;
  }
  setCookie(c, WORKSPACE_COOKIE, workspaceId, cookieOptions(60 * 60 * 24 * 30));
}

async function actorOf(c: Parameters<typeof getCookie>[0]): Promise<Actor> {
  const header = c.req.header("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const actor = await actorFromApiKey(header.slice(7).trim());
    if (actor) return actor;
  }
  const token = getCookie(c, COOKIE);
  if (token) {
    const actor = await actorFromSession(token, getCookie(c, WORKSPACE_COOKIE) ?? null);
    if (actor) return actor;
  }
  throw new ApiError(401, "Sessão expirada.");
}

function billingExempt(method: string, path: string) {
  if (path === "/health" || path === "/webhooks/dodo") return true;
  if (path.startsWith("/auth/")) return true;
  if (path === "/bootstrap" || path === "/billing") return true;
  if (path === "/billing/checkout" || path === "/billing/portal") return true;
  if (method === "POST" && /^\/workspaces\/[^/]+\/(select|accept|decline)$/.test(path)) return true;
  if (
    path === "/demands/link-info" ||
    path === "/demands/agent-chat" ||
    path === "/demands/submit-via-link"
  ) {
    return true;
  }
  if (path === "/mcp") return true;
  return false;
}

app.use("*", async (c, next) => {
  if (billingExempt(c.req.method, c.req.path)) return next();
  await assertWorkspaceEntitled(await actorOf(c));
  return next();
});

async function readCsvText(c: Parameters<typeof getCookie>[0]) {
  const text = await c.req.text();
  if (text.length > 5_000_000) throw new ApiError(413, "O arquivo passa de 5 MB.");
  if (!text.trim()) throw new ApiError(400, "O arquivo CSV está vazio.");
  return text;
}

app.get("/health", (c) => c.json({ ok: true }));

app.post("/auth/signup", async (c) => {
  const body = parse(
    z.object({ name: z.string(), email: z.string(), password: z.string() }),
    await c.req.json(),
  );
  await assertSignupRate(clientIp(c), body.email.trim().toLowerCase());
  const result = await signup(body);
  if (result.created) {
    writeSession(c, result.token);
    writeWorkspace(c, result.workspaceId);
  }
  return c.json({ ok: true });
});

app.post("/auth/login", async (c) => {
  const body = parse(
    z.object({ email: z.string(), password: z.string() }),
    await c.req.json(),
  );
  const result = await login(body.email, body.password);
  writeSession(c, result.token);
  writeWorkspace(c, result.workspaceId);
  return c.json({ user: result.user });
});

app.post("/auth/logout", async (c) => {
  const token = getCookie(c, COOKIE);
  if (token) await destroySession(token);
  deleteCookie(c, COOKIE, cookieOptions());
  deleteCookie(c, WORKSPACE_COOKIE, cookieOptions());
  return c.json({ ok: true });
});

app.post("/auth/reset", async (c) => {
  const body = parse(z.object({ email: z.string() }), await c.req.json());
  await assertResetRate(clientIp(c), body.email.trim().toLowerCase());
  await requestReset(body.email);
  return c.json({ ok: true });
});

app.post("/auth/reset/confirm", async (c) => {
  const body = parse(
    z.object({ token: z.string(), password: z.string() }),
    await c.req.json(),
  );
  await assertResetConfirmRate(clientIp(c));
  await confirmReset(body.token, body.password);
  return c.json({ ok: true });
});

app.post("/auth/verify/confirm", async (c) => {
  const body = parse(z.object({ token: z.string() }), await c.req.json());
  await assertVerifyConfirmRate(clientIp(c));
  await confirmEmail(body.token);
  return c.json({ ok: true });
});

app.post("/auth/verify/resend", async (c) => {
  const actor = await actorOf(c);
  await assertVerifyResendRate(clientIp(c), actor.email);
  await resendEmailConfirmation(actor);
  return c.json({ ok: true });
});

app.post("/auth/firebase", async (c) => {
  const body = parse(z.object({ idToken: z.string().min(20).max(5000) }), await c.req.json());
  await assertGoogleRate(clientIp(c));
  const result = await loginWithGoogle(await firebaseIdentityProfile(body.idToken));
  writeSession(c, result.token);
  writeWorkspace(c, result.workspaceId);
  return c.json({ ok: true });
});

function loginPath(error: string) {
  return `${appOrigin()}/login?erro=${error}`;
}

function clearOAuth(c: Parameters<typeof deleteCookie>[0]) {
  deleteCookie(c, OAUTH_STATE, cookieOptions());
  deleteCookie(c, OAUTH_VERIFIER, cookieOptions());
}

app.get("/auth/google/start", async (c) => {
  if (!googleConfigured()) return c.redirect(loginPath("google"));
  try {
    await assertGoogleRate(clientIp(c));
  } catch {
    return c.redirect(loginPath("google_failed"));
  }
  const state = randomToken();
  const { verifier, challenge } = googlePkce();
  setCookie(c, OAUTH_STATE, state, cookieOptions(10 * 60));
  setCookie(c, OAUTH_VERIFIER, verifier, cookieOptions(10 * 60));
  return c.redirect(googleAuthUrl(state, challenge));
});

app.get("/auth/google/callback", async (c) => {
  const state = getCookie(c, OAUTH_STATE);
  const verifier = getCookie(c, OAUTH_VERIFIER);
  clearOAuth(c);
  if (!googleConfigured()) return c.redirect(loginPath("google"));
  try {
    await assertGoogleRate(clientIp(c));
  } catch {
    return c.redirect(loginPath("google_failed"));
  }
  const returned = c.req.query("state") ?? "";
  const code = c.req.query("code") ?? "";
  if (c.req.query("error") === "access_denied") return c.redirect(loginPath("google_denied"));
  if (!state || !verifier || !code || !hashesEqual(state, returned)) {
    return c.redirect(loginPath("google_failed"));
  }
  try {
    const profile = await exchangeGoogleCode(code, verifier);
    const result = await loginWithGoogle(profile);
    writeSession(c, result.token);
    writeWorkspace(c, result.workspaceId);
    return c.redirect(`${appOrigin()}/`);
  } catch (error) {
    if (error instanceof ApiError && error.message === "O Google não confirmou este e-mail.") {
      return c.redirect(loginPath("google_unverified"));
    }
    console.error("[google] falha no callback", error);
    return c.redirect(loginPath("google_failed"));
  }
});

app.get("/bootstrap", async (c) => c.json(await bootstrap(await actorOf(c))));

app.get("/billing", async (c) => c.json(await billingSnapshot(await actorOf(c))));

app.post("/billing/checkout", async (c) => c.json(await createCheckout(await actorOf(c))));

app.post("/billing/portal", async (c) => c.json(await createPortal(await actorOf(c))));

app.post("/billing/seat-quote", async (c) => {
  const body = parse(z.object({ email: z.string() }), await c.req.json());
  return c.json(await quoteSeats(await actorOf(c), body.email));
});

app.post("/billing/seats", async (c) => {
  const body = parse(
    z.object({
      extraSeats: z.number().int().min(0).max(10),
      seatPacks: z.number().int().min(0).max(2),
    }),
    await c.req.json(),
  );
  return c.json(await changeSeats(await actorOf(c), body));
});

app.post("/billing/period", async (c) => {
  const body = parse(z.object({ period: z.enum(["month", "quarter"]) }), await c.req.json());
  return c.json(await changeBillingPeriod(await actorOf(c), body.period));
});

app.post("/webhooks/dodo", async (c) => {
  await handleDodoWebhook(await c.req.text(), {
    id: c.req.header("webhook-id") ?? "",
    signature: c.req.header("webhook-signature") ?? "",
    timestamp: c.req.header("webhook-timestamp") ?? "",
  });
  return c.json({ received: true });
});

app.post("/workspaces", async (c) => {
  const body = parse(z.object({ name: z.string() }), await c.req.json());
  const workspace = await createWorkspace(await actorOf(c), body.name);
  writeWorkspace(c, workspace.id);
  return c.json(workspace);
});

app.post("/workspaces/:id/select", async (c) => {
  const actor = await actorOf(c);
  const id = c.req.param("id");
  await selectWorkspace(actor, id);
  writeWorkspace(c, id);
  return c.json({ ok: true });
});

app.patch("/workspaces/current", async (c) => {
  const body = parse(
    z.object({
      name: z.string().optional(),
      logo: z.string().nullable().optional(),
    }),
    await c.req.json(),
  );
  return c.json(await updateCurrentWorkspace(await actorOf(c), body));
});

app.get("/workspace/csv", async (c) => {
  const projectId = c.req.query("projectId")?.trim() || undefined;
  const file = await exportWorkspaceCsv(await actorOf(c), projectId);
  return c.body(file.csv, 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${file.filename}"`,
    "cache-control": "no-store",
  });
});

app.post("/workspace/csv/preview", async (c) => {
  const projectId = c.req.query("projectId")?.trim() || undefined;
  return c.json(await previewWorkspaceCsv(await actorOf(c), await readCsvText(c), projectId));
});

app.post("/workspace/csv/import", async (c) => {
  const projectId = c.req.query("projectId")?.trim() || undefined;
  return c.json(await importWorkspaceCsv(await actorOf(c), await readCsvText(c), projectId));
});

app.get("/workspace/agent", async (c) => c.json(await readWorkspaceAgent(await actorOf(c))));

app.put("/workspace/agent", async (c) => {
  const body = parse(agentConfig, await c.req.json());
  return c.json(await saveWorkspaceAgent(await actorOf(c), body));
});

app.delete("/workspaces/:id", async (c) => {
  const actor = await actorOf(c);
  const id = c.req.param("id");
  const result = await deleteWorkspace(actor, id);
  if (!actor.apiKeyId && actor.workspaceId === id) writeWorkspace(c, result.nextWorkspaceId);
  return c.json({ ok: true });
});

app.post("/workspaces/:id/accept", async (c) => {
  const actor = await actorOf(c);
  const id = c.req.param("id");
  await acceptInvite(actor, id);
  if (!actor.workspaceId) writeWorkspace(c, id);
  return c.json({ ok: true });
});

app.post("/workspaces/:id/decline", async (c) => {
  await declineInvite(await actorOf(c), c.req.param("id"));
  return c.json({ ok: true });
});

app.get("/users", async (c) => {
  const { listUsers } = await import("./domain");
  return c.json(await listUsers(await actorOf(c)));
});

app.post("/users", async (c) => {
  const body = parse(
    z.object({
      name: z.string(),
      email: z.string(),
      password: z.string().optional(),
      role: z.string(),
      access,
      projectId: z.string().optional(),
    }),
    await c.req.json(),
  );
  return c.json(await addMember(await actorOf(c), body));
});

app.delete("/users/:id", async (c) => {
  await removeMember(await actorOf(c), c.req.param("id"));
  return c.json({ ok: true });
});

app.patch("/users/:id", async (c) => {
  const body = parse(
    z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      name: z.string().optional(),
      email: z.string().optional(),
      role: z.string().optional(),
      access: access.optional(),
      avatar: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      password: z.string().optional(),
      currentPassword: z.string().optional(),
    }),
    await c.req.json(),
  );
  return c.json(await updateUser(await actorOf(c), c.req.param("id"), body));
});

app.get("/projects", async (c) => {
  const { listProjects } = await import("./domain");
  return c.json(await listProjects(await actorOf(c)));
});

app.post("/projects", async (c) => {
  const body = parse(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      color: z.string(),
    }),
    await c.req.json(),
  );
  return c.json(await createProject(await actorOf(c), body));
});

app.patch("/projects/:id", async (c) => {
  const body = parse(
    z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      color: z.string().optional(),
    }),
    await c.req.json(),
  );
  return c.json(await updateProject(await actorOf(c), c.req.param("id"), body));
});

app.post("/projects/:id/sections", async (c) => {
  const body = parse(z.object({ name: z.string() }), await c.req.json());
  const name = await createSection(await actorOf(c), c.req.param("id"), body.name);
  return c.json({ name });
});

app.patch("/projects/:id/sections", async (c) => {
  const body = parse(z.object({ from: z.string(), to: z.string() }), await c.req.json());
  const name = await renameSection(await actorOf(c), c.req.param("id"), body.from, body.to);
  return c.json({ name });
});

app.delete("/projects/:id/sections", async (c) => {
  const body = parse(z.object({ name: z.string() }), await c.req.json());
  const fallback = await deleteSection(await actorOf(c), c.req.param("id"), body.name);
  return c.json({ fallback });
});

app.post("/projects/:id/sections/reorder", async (c) => {
  const body = parse(z.object({ names: z.array(z.string()) }), await c.req.json());
  await reorderSections(await actorOf(c), c.req.param("id"), body.names);
  return c.json({ ok: true });
});

app.delete("/projects/:id", async (c) => {
  await deleteProject(await actorOf(c), c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/projects/:id/members", async (c) => {
  const body = parse(z.object({ userId: z.string() }), await c.req.json());
  return c.json(await addProjectMember(await actorOf(c), c.req.param("id"), body.userId));
});

app.post("/tasks", async (c) => {
  const body = parse(
    z.object({
      projectId: z.string(),
      title: z.string(),
      description: z.string().optional(),
      assigneeId: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      startDate: z.string().nullable().optional(),
      priority: priority.optional(),
      tagIds: z.array(z.string()).optional(),
      section: z.string().optional(),
      isDemand: z.boolean().optional(),
      demandFormat: z.string().nullable().optional(),
      referenceUrls: z.string().nullable().optional(),
    }),
    await c.req.json(),
  );
  return c.json(await createTask(await actorOf(c), body));
});

app.patch("/tasks/:id", async (c) => {
  const body = parse(
    z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      assigneeId: z.string().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      startDate: z.string().nullable().optional(),
      priority: priority.optional(),
      status: status.optional(),
      tagIds: z.array(z.string()).optional(),
      section: z.string().optional(),
      order: z.number().optional(),
      projectId: z.string().optional(),
      isDemand: z.boolean().optional(),
      demandFormat: z.string().nullable().optional(),
      referenceUrls: z.string().nullable().optional(),
    }),
    await c.req.json(),
  );
  return c.json(await updateTask(await actorOf(c), c.req.param("id"), body));
});

app.post("/tasks/:id/approval", async (c) => {
  const body = parse(
    z.object({
      status: approvalStatus,
      feedback: z.string().optional(),
    }),
    await c.req.json(),
  );
  return c.json(await updateTaskApproval(await actorOf(c), c.req.param("id"), body));
});

app.delete("/tasks/:id", async (c) => {
  await deleteTask(await actorOf(c), c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/tasks/:id/subtasks", async (c) => {
  const body = parse(
    z.object({ title: z.string(), dueDate: z.string().nullable().optional() }),
    await c.req.json(),
  );
  return c.json(await addSubtask(await actorOf(c), c.req.param("id"), body.title, body.dueDate));
});

app.post("/tasks/:id/comments", async (c) => {
  const body = parse(z.object({ body: z.string() }), await c.req.json());
  return c.json(await addComment(await actorOf(c), c.req.param("id"), body.body));
});

app.post("/tasks/:id/follow", async (c) => {
  const body = parse(z.object({ follow: z.boolean() }), await c.req.json());
  return c.json(await setTaskFollow(await actorOf(c), c.req.param("id"), body.follow));
});

app.post("/tasks/:id/attachments", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) throw new ApiError(400, "Envie um arquivo.");
  const bytes = Buffer.from(await file.arrayBuffer());
  return c.json(
    await addAttachment(await actorOf(c), c.req.param("id"), {
      name: file.name,
      type: file.type,
      size: bytes.byteLength,
      bytes,
    }),
  );
});

app.get("/tasks/:id/attachments/:attachmentId", async (c) => {
  const file = await readAttachment(
    await actorOf(c),
    c.req.param("id"),
    c.req.param("attachmentId"),
  );
  const name = file.name.replace(/["\r\n]/g, "");
  const mime = file.mime.toLowerCase().split(";")[0].trim();
  const safe = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);
  return c.body(file.bytes, 200, {
    "content-type": safe.has(mime) ? mime : "application/octet-stream",
    "content-disposition": `attachment; filename="${name}"`,
    "x-content-type-options": "nosniff",
  });
});

app.delete("/tasks/:id/attachments/:attachmentId", async (c) => {
  return c.json(
    await removeAttachment(await actorOf(c), c.req.param("id"), c.req.param("attachmentId")),
  );
});

app.get("/events", async (c) => {
  const actor = await actorOf(c);
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("X-Accel-Buffering", "no");
  return streamSSE(c, async (stream) => {
    let open = true;
    await stream.writeSSE({ event: "ping", data: "1" });
    const stop = subscribe((event) => {
      if (!open) return;
      if (event.kind === "notification") {
        if (event.userId !== actor.id) return;
      } else if (!actor.workspaceId || event.workspaceId !== actor.workspaceId) {
        return;
      }
      void stream.writeSSE({ data: JSON.stringify(event) });
    });
    stream.onAbort(() => {
      open = false;
      stop();
    });
    try {
      while (open) {
        await stream.sleep(15000);
        if (!open) break;
        await stream.writeSSE({ event: "ping", data: "1" });
      }
    } finally {
      open = false;
      stop();
    }
  });
});

app.post("/tasks/reorder", async (c) => {
  const body = parse(z.object({ ids: z.array(z.string()) }), await c.req.json());
  await reorderTasks(await actorOf(c), body.ids);
  return c.json({ ok: true });
});

app.post("/tags", async (c) => {
  const body = parse(z.object({ name: z.string(), color: z.string() }), await c.req.json());
  return c.json(await createTag(await actorOf(c), body.name, body.color));
});

app.patch("/tags/:id", async (c) => {
  const body = parse(
    z.object({ name: z.string().optional(), color: z.string().optional() }),
    await c.req.json(),
  );
  return c.json(await updateTag(await actorOf(c), c.req.param("id"), body));
});

app.delete("/tags/:id", async (c) => {
  await deleteTag(await actorOf(c), c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/threads", async (c) => {
  const body = parse(
    z.object({
      title: z.string(),
      participantIds: z.array(z.string()),
      projectId: z.string().nullable().optional(),
    }),
    await c.req.json(),
  );
  return c.json(
    await createThread(await actorOf(c), body.title, body.participantIds, body.projectId),
  );
});

app.post("/threads/:id/messages", async (c) => {
  const body = parse(z.object({ body: z.string() }), await c.req.json());
  return c.json(await sendMessage(await actorOf(c), c.req.param("id"), body.body));
});

app.get("/notifications", async (c) => c.json(await listNotifications(await actorOf(c))));

app.post("/notifications/read-all", async (c) =>
  c.json(await markAllNotificationsRead(await actorOf(c))),
);

app.post("/notifications/:id/read", async (c) =>
  c.json(await markNotificationRead(await actorOf(c), c.req.param("id"))),
);

app.get("/api-keys", async (c) => c.json(await listApiKeys(await actorOf(c))));

app.post("/api-keys", async (c) => {
  const body = parse(z.object({ name: z.string() }), await c.req.json());
  return c.json(await createApiKey(await actorOf(c), body.name));
});

app.delete("/api-keys/:id", async (c) => {
  await deleteApiKey(await actorOf(c), c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/api-keys/:id/rotate", async (c) => {
  return c.json(await rotateApiKey(await actorOf(c), c.req.param("id")));
});

app.post("/ai/test", async (c) => {
  await actorOf(c);
  const body = parse(z.object({ agent: agentConfig }), await c.req.json());
  return c.json(await testAgent(body.agent));
});

app.post("/ai/chat", async (c) => {
  const actor = await actorOf(c);
  const body = parse(
    z.object({
      agent: agentConfig,
      messages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().max(30000),
            images: z.array(z.string()).optional(),
            documents: z
              .array(
                z.object({
                  name: z.string(),
                  size: z.number(),
                  type: z.string().optional(),
                  pageCount: z.number().optional(),
                  text: z.string(),
                  pageImages: z.array(z.string().max(2_000_000)).max(40).optional(),
                }),
              )
              .optional(),
          }),
        )
        .min(1)
        .max(100),
    }),
    await c.req.json(),
  );
  const agent = await normalizeConfig(body.agent);
  c.header("Content-Type", "application/x-ndjson; charset=utf-8");
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("X-Accel-Buffering", "no");
  return stream(c, async (out) => {
    const controller = new AbortController();
    out.onAbort(() => controller.abort());
    const emit = (event: AgentEvent) => {
      if (controller.signal.aborted) return;
      void out.write(`${JSON.stringify(event)}\n`);
    };
    try {
      await runAgent(actor, agent, body.messages, emit, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        const message =
          error instanceof ApiError ? error.message : "Não foi possível falar com o agente.";
        if (!(error instanceof ApiError)) console.error(error);
        emit({ type: "error", message });
      }
    }
    emit({ type: "done" });
  });
});

app.post("/demands/generate-link", async (c) => {
  const actor = await actorOf(c);
  const body = parse(
    z.object({
      projectId: z.string(),
      agent: agentConfig.optional(),
    }),
    await c.req.json(),
  );
  return c.json(await generateDemandLinkToken(actor, body.projectId, body.agent));
});

app.get("/demands/link-info", async (c) => {
  await assertDemandRate(clientIp(c), "info");
  const token = c.req.query("token") ?? "";
  if (!token) throw new ApiError(400, "Token ausente.");
  return c.json(await verifyDemandLinkToken(token));
});

app.post("/demands/agent-chat", async (c) => {
  await assertDemandRate(clientIp(c), "chat");
  const body = parse(
    z.object({
      token: z.string(),
      messages: z.array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
          images: z.array(z.string()).optional(),
          videos: z.array(z.string()).optional(),
          documents: z.array(z.any()).optional(),
        }),
      ),
      currentDemand: z
        .object({
          subject: z.string().optional(),
          format: z.string().optional(),
          tagIds: z.array(z.string()).optional(),
          dueDate: z.string().optional(),
          referenceUrls: z.string().optional(),
          notes: z.string().optional(),
          requesterName: z.string().optional(),
          isReadyToConfirm: z.boolean().optional(),
        })
        .optional(),
    }),
    await c.req.json(),
  );
  return c.json(await processDemandChatTurn(body.token, body.messages, body.currentDemand));
});

app.post("/demands/submit-via-link", async (c) => {
  await assertDemandRate(clientIp(c), "submit");
  const body = parse(
    z.object({
      token: z.string(),
      demand: z.object({
        title: z.string().optional().default(""),
        subject: z.string().optional(),
        description: z.string().optional().default(""),
        demandFormat: z.string().optional(),
        tagIds: z.array(z.string()).optional(),
        dueDate: z.string().optional(),
        referenceUrls: z.string().optional(),
        requesterName: z.string().optional(),
        requesterEmail: z.string().optional(),
        attachments: z
          .array(
            z.object({
              name: z.string(),
              type: z.string(),
              size: z.number(),
              base64: z.string().optional(),
              url: z.string().optional(),
            }),
          )
          .optional(),
      }),
    }),
    await c.req.json(),
  );
  return c.json(await submitDemandViaVerifiedLink(body.token, body.demand));
});

app.post("/mcp", async (c) => {
  const header = c.req.header("authorization");
  const secret = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const actor = secret ? await actorFromApiKey(secret) : null;
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return c.json(rpcError(null, -32700, "JSON inválido."), 400);
  }
  if (!actor) {
    const id = payload && typeof payload === "object" && "id" in payload ? payload.id : null;
    return c.json(rpcError(id as string | number | null, -32001, "Unauthorized"), 401);
  }
  try {
    await assertWorkspaceEntitled(actor);
  } catch (error) {
    const id = payload && typeof payload === "object" && "id" in payload ? payload.id : null;
    const detail = error instanceof ApiError ? error.message : "Assinatura necessária.";
    return c.json(rpcError(id as string | number | null, -32001, detail), 402);
  }
  const messages = Array.isArray(payload) ? payload : [payload];
  const responses = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const rpc = message as { id?: string | number | null; method?: string };
    if (rpc.method?.startsWith("notifications/")) continue;
    try {
      const result = await handleMcpMessage(actor, rpc);
      if (result === undefined) continue;
      responses.push({ jsonrpc: "2.0", id: rpc.id ?? null, result });
    } catch (error) {
      const detail = error instanceof ApiError ? error.message : "Erro interno.";
      responses.push(rpcError(rpc.id, -32601, detail));
    }
  }
  if (responses.length === 0) return c.body(null, 202);
  return c.json(responses.length === 1 ? responses[0] : responses);
});

app.get("/mcp", (c) => c.json(rpcError(null, -32000, "Use POST."), 405));
app.delete("/mcp", (c) => c.json(rpcError(null, -32000, "Sessão stateless."), 405));

const port = Number(process.env.PORT ?? 4000);
const hostname = process.env.HOST ?? "127.0.0.1";
try {
  assertDemandLinkSecret();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
serve({ fetch: app.fetch, hostname, port }, () => {
  console.log(`ASA API em http://${hostname}:${port}`);
});
