import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import {
  actorFromApiKey,
  actorFromSession,
  acceptInvite,
  addComment,
  addMember,
  addProjectMember,
  addSubtask,
  bootstrap,
  confirmReset,
  createApiKey,
  createProject,
  createWorkspace,
  deleteWorkspace,
  createSection,
  createTag,
  createTask,
  createThread,
  updateProject,
  declineInvite,
  deleteApiKey,
  deleteProject,
  deleteTag,
  deleteTask,
  destroySession,
  listApiKeys,
  listNotifications,
  login,
  markAllNotificationsRead,
  markNotificationRead,
  removeMember,
  renameSection,
  renameWorkspace,
  reorderTasks,
  requestReset,
  selectWorkspace,
  sendMessage,
  signup,
  updateTag,
  updateTask,
  updateUser,
} from "./domain";
import type { Actor } from "./domain";
import { ApiError } from "./errors";
import { handleMcpMessage, rpcError } from "./mcp";

const access = z.enum(["admin", "editor", "leitura"]);
const priority = z.enum(["baixa", "media", "alta", "urgente"]);
const status = z.enum(["todo", "doing", "done"]);

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
    origin: "*",
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

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: process.env.COOKIE_SECURE === "1",
    path: "/",
    maxAge,
  };
}

function writeSession(c: Parameters<typeof setCookie>[0], token: string) {
  setCookie(c, COOKIE, token, cookieOptions(60 * 60 * 24 * 30));
}

function writeWorkspace(c: Parameters<typeof setCookie>[0], workspaceId: string | null) {
  if (!workspaceId) {
    deleteCookie(c, WORKSPACE_COOKIE, { path: "/" });
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

app.get("/health", (c) => c.json({ ok: true }));

app.post("/auth/signup", async (c) => {
  const body = parse(
    z.object({ name: z.string(), email: z.string(), password: z.string() }),
    await c.req.json(),
  );
  const result = await signup(body);
  writeSession(c, result.token);
  writeWorkspace(c, result.workspaceId);
  return c.json({ user: result.user });
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
  deleteCookie(c, COOKIE, { path: "/" });
  deleteCookie(c, WORKSPACE_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.post("/auth/reset", async (c) => {
  const body = parse(z.object({ email: z.string() }), await c.req.json());
  return c.json(await requestReset(body.email));
});

app.post("/auth/reset/confirm", async (c) => {
  const body = parse(
    z.object({ token: z.string(), password: z.string() }),
    await c.req.json(),
  );
  await confirmReset(body.token, body.password);
  return c.json({ ok: true });
});

app.get("/bootstrap", async (c) => c.json(await bootstrap(await actorOf(c))));

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
  const body = parse(z.object({ name: z.string() }), await c.req.json());
  return c.json(await renameWorkspace(await actorOf(c), body.name));
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
      name: z.string().optional(),
      email: z.string().optional(),
      role: z.string().optional(),
      access: access.optional(),
      avatar: z.string().nullable().optional(),
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
    }),
    await c.req.json(),
  );
  return c.json(await updateTask(await actorOf(c), c.req.param("id"), body));
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
serve({ fetch: app.fetch, hostname, port }, () => {
  console.log(`ASA API em http://${hostname}:${port}`);
});
