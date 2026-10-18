export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as { error?: string }) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "Não foi possível concluir.");
  }
  return data as T;
}
