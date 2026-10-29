import { ApiError } from "./client";

export type PublicApproval = "none" | "pending" | "approved" | "changes_requested";

export type PublicBrand = { name: string; logo: string | null };

export type PublicShareInfo =
  | { kind: "open"; project: { name: string; color: string }; workspace: PublicBrand }
  | { kind: "locked"; workspace: PublicBrand }
  | { kind: "unavailable" };

export interface PublicTask {
  id: string;
  title: string;
  description: string;
  startDate: string | null;
  dueDate: string | null;
  status: "todo" | "doing" | "done";
  section: string;
  approvalStatus: PublicApproval;
  isDemand: boolean;
  demandFormat: string | null;
  referenceUrls: string | null;
  tags: { name: string; color: string }[];
  attachments: { id: string; name: string; mime: string; size: number }[];
}

// Respostas que a página trata como estado, não como erro genérico.
export class ShareLockedError extends ApiError {}
export class ShareUnavailableError extends ApiError {}

export function sharePath(token: string, rest = "") {
  return `/api/public/share/${encodeURIComponent(token)}${rest}`;
}

export function attachmentUrl(token: string, taskId: string, fileId: string, preview = false) {
  const base = sharePath(
    token,
    `/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(fileId)}`,
  );
  return preview ? `${base}/preview` : base;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const text = await res.text();
  let data: (Record<string, unknown> & { error?: string }) | null = null;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown> & { error?: string }) : null;
  } catch {
    data = null;
  }
  if (res.status === 401) throw new ShareLockedError(401, data?.error ?? "Acesso não liberado.");
  if (!res.ok) throw new ApiError(res.status, data?.error ?? "Não foi possível carregar.");
  if (data?.unavailable === true) throw new ShareUnavailableError(503, "Indisponível.");
  return data as T;
}

export async function getShareInfo(token: string): Promise<PublicShareInfo> {
  try {
    const data = await call<{
      requiresPin?: boolean;
      project?: { name: string; color: string };
      workspace: PublicBrand;
    }>(sharePath(token));
    if (data.requiresPin) return { kind: "locked", workspace: data.workspace };
    return { kind: "open", project: data.project!, workspace: data.workspace };
  } catch (error) {
    if (error instanceof ShareUnavailableError) return { kind: "unavailable" };
    throw error;
  }
}

export async function unlockShare(token: string, pin: string) {
  await call<{ ok: true }>(sharePath(token, "/unlock"), {
    method: "POST",
    body: JSON.stringify({ pin }),
  });
}

export async function listShareTasks(
  token: string,
  range?: { from?: string; to?: string; includeUndated?: boolean },
) {
  const query = new URLSearchParams();
  if (range?.from) query.set("from", range.from);
  if (range?.to) query.set("to", range.to);
  if (range?.includeUndated) query.set("includeUndated", "1");
  const suffix = query.size ? `?${query.toString()}` : "";
  const data = await call<{ tasks: PublicTask[] }>(sharePath(token, `/tasks${suffix}`));
  return data.tasks;
}

export async function getShareTask(token: string, taskId: string) {
  return call<PublicTask>(sharePath(token, `/tasks/${encodeURIComponent(taskId)}`));
}
