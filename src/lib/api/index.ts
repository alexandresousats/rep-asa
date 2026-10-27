import type { Priority, Task, TaskStatus, User } from "../types";
import { usePrefs } from "../prefs";
import { useWorkspace } from "../workspace";
import { ApiError, request } from "./client";

export { askAssistant } from "./assistant";

type Result = { ok: true } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof ApiError) return { ok: false, error: error.message };
  return { ok: false, error: "Não foi possível falar com o servidor." };
}

export async function loadSession() {
  try {
    const data = await request<{
      user: User;
      workspace: ReturnType<typeof useWorkspace.getState>["workspace"];
      workspaces: ReturnType<typeof useWorkspace.getState>["workspaces"];
      invites: ReturnType<typeof useWorkspace.getState>["invites"];
      users: User[];
      projects: ReturnType<typeof useWorkspace.getState>["projects"];
      tasks: Task[];
      tags: ReturnType<typeof useWorkspace.getState>["tags"];
      threads: ReturnType<typeof useWorkspace.getState>["threads"];
      messages: ReturnType<typeof useWorkspace.getState>["messages"];
      notifications: ReturnType<typeof useWorkspace.getState>["notifications"];
      billing: ReturnType<typeof useWorkspace.getState>["billing"];
    }>("/bootstrap");
    useWorkspace.getState().hydrate(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      useWorkspace.getState().clear();
      return;
    }
    useWorkspace.getState().fail();
  }
}

export async function refreshNotifications() {
  const state = useWorkspace.getState();
  if (!state.user) return;
  if (state.workspace && state.billing?.active !== true) return;
  try {
    const notifications = await request<
      ReturnType<typeof useWorkspace.getState>["notifications"]
    >("/notifications");
    useWorkspace.getState().setNotifications(notifications);
  } catch {
    // The bell keeps the last list if the refresh misses.
  }
}

export async function loginWithFirebase(idToken: string): Promise<Result> {
  try {
    await request("/auth/firebase", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    });
    await loadSession();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function login(email: string, password: string): Promise<Result> {
  try {
    await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    await loadSession();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function signup(input: {
  name: string;
  email: string;
  password: string;
}): Promise<Result> {
  try {
    await request("/auth/signup", { method: "POST", body: JSON.stringify(input) });
    await loadSession();
    if (!useWorkspace.getState().user) {
      return {
        ok: false,
        error:
          "Não foi possível criar a conta. Se você já tem conta, entre ou redefina a senha.",
      };
    }
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function logout() {
  try {
    await request("/auth/logout", { method: "POST" });
  } catch {
    // Local session still ends if the server is unreachable.
  }
  useWorkspace.getState().clear();
}

export async function startCheckout() {
  return request<{ url: string }>("/billing/checkout", { method: "POST" });
}

export async function openBillingPortal() {
  return request<{ url: string }>("/billing/portal", { method: "POST" });
}

export async function quoteSeats(email: string) {
  return request<{
    people: number;
    capacity: number;
    target: number;
    needsPurchase: boolean;
    blocked: boolean;
    message: string;
    suggestion: { extraSeats: number; seatPacks: number; totalLabel: string; detail: string } | null;
  }>("/billing/seat-quote", { method: "POST", body: JSON.stringify({ email }) });
}

export async function updateSeats(input: { extraSeats: number; seatPacks: number }) {
  return request<{ url: string | null }>("/billing/seats", { method: "POST", body: JSON.stringify(input) });
}

export async function updateBillingPeriod(period: "month" | "quarter") {
  return request<{ url: string | null }>("/billing/period", { method: "POST", body: JSON.stringify({ period }) });
}

export async function refreshBilling() {
  const billing = await request<NonNullable<ReturnType<typeof useWorkspace.getState>["billing"]>>(
    "/billing",
  );
  useWorkspace.setState({ billing });
  return billing;
}

export async function requestReset(email: string): Promise<Result> {
  try {
    await request("/auth/reset", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function confirmEmail(token: string): Promise<Result> {
  try {
    await request("/auth/verify/confirm", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function resendEmailConfirmation(): Promise<Result> {
  try {
    await request("/auth/verify/resend", { method: "POST" });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function confirmReset(token: string, password: string): Promise<Result> {
  try {
    await request("/auth/reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function updateUser(
  id: string,
  patch: Partial<
    Pick<
      User,
      "firstName" | "lastName" | "name" | "email" | "phone" | "role" | "access" | "avatar"
    >
  > & {
    password?: string;
    currentPassword?: string;
  },
): Promise<Result> {
  try {
    const user = await request<User>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    useWorkspace.getState().upsertUser(user);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function createWorkspace(name: string) {
  await request<{ id: string; name: string }>("/workspaces", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  await loadSession();
}

export async function selectWorkspace(workspaceId: string) {
  await request(`/workspaces/${workspaceId}/select`, { method: "POST" });
  await loadSession();
}

export async function deleteWorkspace(workspaceId: string): Promise<Result> {
  try {
    await request(`/workspaces/${workspaceId}`, { method: "DELETE" });
    await loadSession();
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function renameWorkspace(name: string) {
  const workspace = await request<{ id: string; name: string }>("/workspaces/current", {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  const state = useWorkspace.getState();
  useWorkspace.setState({
    workspace: state.workspace ? { ...state.workspace, name: workspace.name } : null,
    workspaces: state.workspaces.map((item) =>
      item.id === workspace.id ? { ...item, name: workspace.name } : item,
    ),
  });
}

export async function updateWorkspaceLogo(logo: string | null): Promise<Result> {
  try {
    const workspace = await request<{ id: string; name: string; logo: string | null }>(
      "/workspaces/current",
      {
        method: "PATCH",
        body: JSON.stringify({ logo }),
      },
    );
    const state = useWorkspace.getState();
    useWorkspace.setState({
      workspace: state.workspace ? { ...state.workspace, logo: workspace.logo } : null,
    });
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function acceptInvite(workspaceId: string) {
  await request(`/workspaces/${workspaceId}/accept`, { method: "POST" });
  await loadSession();
}

export async function declineInvite(workspaceId: string) {
  await request(`/workspaces/${workspaceId}/decline`, { method: "POST" });
  await loadSession();
}

export async function removeMember(id: string): Promise<Result> {
  const self = useWorkspace.getState().user?.id === id;
  try {
    await request(`/users/${id}`, { method: "DELETE" });
    if (self) await loadSession();
    else useWorkspace.getState().removeUser(id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function addMember(input: {
  name: string;
  email: string;
  password?: string;
  role: string;
  access: User["access"];
  projectId?: string;
}): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  try {
    const user = await request<User>("/users", {
      method: "POST",
      body: JSON.stringify(input),
    });
    useWorkspace.getState().upsertUser(user);
    if (input.projectId) {
      await loadSession();
    }
    return { ok: true, user };
  } catch (error) {
    return fail(error);
  }
}

export async function createProject(input: {
  name: string;
  description: string;
  color: string;
}) {
  const project = await request<ReturnType<typeof useWorkspace.getState>["projects"][number]>(
    "/projects",
    { method: "POST", body: JSON.stringify(input) },
  );
  useWorkspace.getState().upsertProject(project);
  return project;
}

export async function updateProject(
  id: string,
  input: { name: string; description: string; color: string },
) {
  const project = await request<ReturnType<typeof useWorkspace.getState>["projects"][number]>(
    `/projects/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  useWorkspace.getState().upsertProject(project);
  return project;
}

export async function deleteProject(id: string): Promise<Result> {
  try {
    await request(`/projects/${id}`, { method: "DELETE" });
    const state = useWorkspace.getState();
    for (const task of state.tasks) {
      if (task.projectId === id) cancelTaskSave(task.id);
    }
    state.removeProject(id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function createSection(projectId: string, name: string) {
  const data = await request<{ name: string }>(`/projects/${projectId}/sections`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  const current = useWorkspace.getState().projects.find((project) => project.id === projectId);
  if (current && !current.sections?.includes(data.name)) {
    useWorkspace.getState().upsertProject({
      ...current,
      sections: [...(current.sections ?? []), data.name],
    });
  }
  return data.name;
}

export async function renameSection(projectId: string, from: string, to: string) {
  const data = await request<{ name: string }>(`/projects/${projectId}/sections`, {
    method: "PATCH",
    body: JSON.stringify({ from, to }),
  });
  const state = useWorkspace.getState();
  const current = state.projects.find((project) => project.id === projectId);
  if (current) {
    state.upsertProject({
      ...current,
      sections: (current.sections ?? []).map((section) => (section === from ? data.name : section)),
    });
  }
  for (const task of state.tasks) {
    if (task.projectId === projectId && task.section === from) {
      state.upsertTask({ ...task, section: data.name });
    }
  }
  return data.name;
}

export async function deleteSection(
  projectId: string,
  name: string,
): Promise<{ ok: true; fallback: string } | { ok: false; error: string }> {
  try {
    const data = await request<{ fallback: string }>(`/projects/${projectId}/sections`, {
      method: "DELETE",
      body: JSON.stringify({ name }),
    });
    const state = useWorkspace.getState();
    const current = state.projects.find((project) => project.id === projectId);
    if (current) {
      state.upsertProject({
        ...current,
        sections: (current.sections ?? []).filter((section) => section !== name),
      });
    }
    for (const task of useWorkspace.getState().tasks) {
      if (task.projectId === projectId && task.section === name) {
        useWorkspace.getState().upsertTask({ ...task, section: data.fallback });
      }
    }
    return { ok: true, fallback: data.fallback };
  } catch (error) {
    return fail(error);
  }
}

export function reorderSections(projectId: string, names: string[]) {
  const state = useWorkspace.getState();
  const current = state.projects.find((project) => project.id === projectId);
  if (!current) return;
  state.upsertProject({ ...current, sections: names });
  void request(`/projects/${projectId}/sections/reorder`, {
    method: "POST",
    body: JSON.stringify({ names }),
  }).catch(() => {
    void loadSession();
  });
}

export async function addProjectMember(projectId: string, userId: string) {
  const project = await request<ReturnType<typeof useWorkspace.getState>["projects"][number]>(
    `/projects/${projectId}/members`,
    { method: "POST", body: JSON.stringify({ userId }) },
  );
  useWorkspace.getState().upsertProject(project);
  return project;
}

export async function createTask(input: {
  projectId: string;
  title: string;
  description?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  priority?: Priority;
  tagIds?: string[];
  section?: string;
  isDemand?: boolean;
  demandFormat?: string | null;
  referenceUrls?: string | null;
}) {
  const task = await request<Task>("/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
  useWorkspace.getState().upsertTask(task);
  return task;
}

export async function updateTaskApproval(
  taskId: string,
  input: {
    status: NonNullable<Task["approvalStatus"]>;
    feedback?: string;
  },
) {
  const task = await request<Task>(`/tasks/${taskId}/approval`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  useWorkspace.getState().upsertTask(task);
  return task;
}

const taskBuffers = new Map<string, Partial<Task>>();
const taskTimers = new Map<string, ReturnType<typeof setTimeout>>();
const taskSnapshots = new Map<string, Task>();

function cancelTaskSave(id: string) {
  const timer = taskTimers.get(id);
  if (timer) clearTimeout(timer);
  taskTimers.delete(id);
  taskBuffers.delete(id);
  taskSnapshots.delete(id);
}

export function updateTask(id: string, patch: Partial<Task>) {
  const state = useWorkspace.getState();
  const current = state.tasks.find((task) => task.id === id);
  if (!current) return;
  if (!taskSnapshots.has(id)) taskSnapshots.set(id, current);
  state.upsertTask({ ...current, ...patch, id: current.id });
  taskBuffers.set(id, { ...(taskBuffers.get(id) ?? {}), ...patch });
  const timer = taskTimers.get(id);
  if (timer) clearTimeout(timer);
  taskTimers.set(
    id,
    setTimeout(() => {
      const body = { ...(taskBuffers.get(id) ?? {}) };
      delete body.completedAt;
      delete body.comments;
      delete body.subtasks;
      delete body.id;
      const snapshot = taskSnapshots.get(id);
      taskBuffers.delete(id);
      taskTimers.delete(id);
      taskSnapshots.delete(id);
      void request<Task>(`/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
        .then((task) => {
          const pending = taskBuffers.get(id);
          useWorkspace.getState().upsertTask(pending ? { ...task, ...pending, id: task.id } : task);
        })
        .catch(() => {
          if (snapshot && !taskBuffers.has(id)) useWorkspace.getState().upsertTask(snapshot);
        });
    }, 280),
  );
}

export async function deleteTask(id: string): Promise<Result> {
  try {
    await request(`/tasks/${id}`, { method: "DELETE" });
    const state = useWorkspace.getState();
    const gone = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const task of state.tasks) {
        if (task.parentId && gone.has(task.parentId) && !gone.has(task.id)) {
          gone.add(task.id);
          grew = true;
        }
      }
    }
    for (const taskId of gone) cancelTaskSave(taskId);
    state.removeTask(id);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export function setTaskStatus(id: string, status: TaskStatus) {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  updateTask(id, {
    status,
    completedAt: status === "done" ? `${today.getFullYear()}-${month}-${day}` : null,
  });
}

export async function addSubtask(taskId: string, title: string) {
  const task = await request<Task>(`/tasks/${taskId}/subtasks`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  useWorkspace.getState().upsertTask(task);
  return task;
}

export async function addComment(taskId: string, body: string) {
  const task = await request<Task>(`/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  useWorkspace.getState().upsertTask(task);
  return task;
}

export async function setTaskFollow(taskId: string, follow: boolean) {
  const task = await request<Task>(`/tasks/${taskId}/follow`, {
    method: "POST",
    body: JSON.stringify({ follow }),
  });
  useWorkspace.getState().upsertTask(task);
  return task;
}

export async function uploadAttachment(taskId: string, file: File) {
  const body = new FormData();
  body.set("file", file);
  const res = await fetch(`/api/tasks/${taskId}/attachments`, {
    method: "POST",
    body,
    credentials: "include",
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Task & { error?: string }) : null;
  if (!res.ok || !data) {
    throw new ApiError(res.status, data?.error ?? "Não foi possível enviar o arquivo.");
  }
  useWorkspace.getState().upsertTask(data);
  return data;
}

export async function removeAttachment(taskId: string, attachmentId: string) {
  const task = await request<Task>(`/tasks/${taskId}/attachments/${attachmentId}`, {
    method: "DELETE",
  });
  useWorkspace.getState().upsertTask(task);
  return task;
}

export function reorderTasks(ids: string[]) {
  const state = useWorkspace.getState();
  ids.forEach((id, order) => {
    const task = state.tasks.find((item) => item.id === id);
    if (task) state.upsertTask({ ...task, order });
  });
  void request("/tasks/reorder", { method: "POST", body: JSON.stringify({ ids }) }).catch(() => {
    void loadSession();
  });
}

export async function createTag(name: string, color: string) {
  const tag = await request<ReturnType<typeof useWorkspace.getState>["tags"][number]>("/tags", {
    method: "POST",
    body: JSON.stringify({ name, color }),
  });
  useWorkspace.getState().upsertTag(tag);
  return tag;
}

export function updateTag(id: string, patch: { name?: string; color?: string }) {
  const current = useWorkspace.getState().tags.find((tag) => tag.id === id);
  if (current) useWorkspace.getState().upsertTag({ ...current, ...patch });
  void request(`/tags/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).catch(() => {
    if (current) useWorkspace.getState().upsertTag(current);
  });
}

export function deleteTag(id: string) {
  const current = useWorkspace.getState().tags.find((tag) => tag.id === id);
  useWorkspace.getState().removeTag(id);
  void request(`/tags/${id}`, { method: "DELETE" }).catch(() => {
    if (current) useWorkspace.getState().upsertTag(current);
  });
}

export async function sendMessage(threadId: string, body: string) {
  const message = await request<ReturnType<typeof useWorkspace.getState>["messages"][number]>(
    `/threads/${threadId}/messages`,
    { method: "POST", body: JSON.stringify({ body }) },
  );
  useWorkspace.getState().upsertMessage(message);
  return message;
}

export async function createThread(
  title: string,
  participantIds: string[],
  projectId?: string | null,
) {
  const thread = await request<ReturnType<typeof useWorkspace.getState>["threads"][number]>(
    "/threads",
    { method: "POST", body: JSON.stringify({ title, participantIds, projectId }) },
  );
  useWorkspace.getState().upsertThread(thread);
  return thread;
}

export function listMcpServers() {
  return usePrefs.getState().mcpServers;
}

export function createMcpServer(input: {
  name: string;
  url: string;
  transport: "http" | "sse";
  apiKey?: string;
}) {
  return usePrefs.getState().createMcpServer(input);
}

export function updateMcpServer(
  id: string,
  patch: Partial<{
    name: string;
    url: string;
    transport: "http" | "sse";
    apiKey: string;
    enabled: boolean;
  }>,
) {
  usePrefs.getState().updateMcpServer(id, patch);
}

export function deleteMcpServer(id: string) {
  usePrefs.getState().deleteMcpServer(id);
}

export async function listApiKeys() {
  return request<import("../types").ApiKeyInfo[]>("/api-keys");
}

export async function createApiKey(name: string) {
  return request<import("../types").ApiKeyInfo & { secret: string }>("/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deleteApiKey(id: string) {
  await request(`/api-keys/${id}`, { method: "DELETE" });
}

export async function rotateApiKey(id: string) {
  return request<import("../types").ApiKeyInfo & { secret: string }>(`/api-keys/${id}/rotate`, {
    method: "POST",
  });
}

export async function markNotificationRead(id: string) {
  const item = await request<
    ReturnType<typeof useWorkspace.getState>["notifications"][number]
  >(`/notifications/${id}/read`, { method: "POST" });
  const items = useWorkspace.getState().notifications.map((notification) =>
    notification.id === item.id ? item : notification,
  );
  useWorkspace.getState().setNotifications(items);
}

export async function markAllNotificationsRead() {
  const items = await request<ReturnType<typeof useWorkspace.getState>["notifications"]>(
    "/notifications/read-all",
    { method: "POST" },
  );
  useWorkspace.getState().setNotifications(items);
}

export interface DemandLinkInfoResponse {
  ok: boolean;
  project: {
    id: string;
    name: string;
    color: string;
    description: string;
  };
  workspace: {
    id: string;
    name: string;
  };
  verifiedBy: {
    id: string;
    name: string;
    role: string;
    verified: boolean;
    verifiedAt: string;
  };
  tags: { id: string; name: string; color: string }[];
  formats: {
    id: string;
    label: string;
    tagName: string;
    desc: string;
    color: string;
    bgLight: string;
    borderColor: string;
  }[];
}

export async function generateDemandLink(
  projectId: string,
  agent?: { baseUrl: string; apiKey: string; model: string },
) {
  return request<{
    token: string;
    project: { id: string; name: string; color: string };
    workspace: { id: string; name: string };
    verifiedBy: { id: string; name: string; role: string; verified: boolean };
  }>("/demands/generate-link", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      ...(agent?.baseUrl && agent.apiKey && agent.model ? { agent } : {}),
    }),
  });
}

export async function syncWorkspaceAgent(agent: {
  baseUrl: string;
  apiKey: string;
  model: string;
}) {
  return request<{ ok: boolean }>("/workspace/agent", {
    method: "PUT",
    body: JSON.stringify(agent),
  });
}

export async function getDemandLinkInfo(token: string) {
  return request<DemandLinkInfoResponse>(`/demands/link-info?token=${encodeURIComponent(token)}`);
}

export interface DemandExtractionState {
  subject?: string;
  format?: string;
  tagIds?: string[];
  dueDate?: string;
  referenceUrls?: string;
  notes?: string;
  requesterName?: string;
  isReadyToConfirm?: boolean;
}

export interface SubmitDemandPayload {
  title?: string;
  subject?: string;
  description?: string;
  demandFormat?: string;
  tagIds?: string[];
  dueDate?: string;
  referenceUrls?: string;
  requesterName?: string;
  requesterEmail?: string;
  attachments?: {
    name: string;
    type: string;
    size: number;
    base64?: string;
    url?: string;
  }[];
}

export async function chatWithDemandAgent(
  token: string,
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    images?: string[];
    videos?: string[];
    documents?: unknown[];
  }>,
  currentDemand?: DemandExtractionState,
) {
  return request<{
    ok: boolean;
    reply: string;
    updatedDemand: DemandExtractionState;
    uiAction?: "formats" | "review";
    submitRequested?: boolean;
    project: { id: string; name: string };
    verifiedBy: { name: string };
  }>("/demands/agent-chat", {
    method: "POST",
    body: JSON.stringify({ token, messages, currentDemand }),
  });
}

export async function submitDemandViaLink(token: string, demand: SubmitDemandPayload) {
  return request<{
    ok: boolean;
    task: Task;
    demandCode: string;
    projectName: string;
    workspaceName: string;
  }>("/demands/submit-via-link", {
    method: "POST",
    body: JSON.stringify({ token, demand }),
  });
}

export type CsvImportReport = {
  tasks: number;
  created: number;
  updated: number;
  skipped: number;
  projectsCreated: string[];
  warnings: string[];
};

function csvQuery(projectId?: string) {
  return projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
}

export async function downloadWorkspaceCsv(projectId?: string) {
  const res = await fetch(`/api/workspace/csv${csvQuery(projectId)}`, { credentials: "include" });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, data?.error ?? "Não foi possível exportar o CSV.");
  }
  const blob = await res.blob();
  const match = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = match?.[1] || "tarefas.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function previewCsvImport(csv: string, projectId?: string) {
  return request<CsvImportReport>(`/workspace/csv/preview${csvQuery(projectId)}`, {
    method: "POST",
    body: csv,
    headers: { "content-type": "text/csv; charset=utf-8" },
  });
}

export async function importWorkspaceCsv(csv: string, projectId?: string) {
  return request<CsvImportReport>(`/workspace/csv/import${csvQuery(projectId)}`, {
    method: "POST",
    body: csv,
    headers: { "content-type": "text/csv; charset=utf-8" },
  });
}
