import { prisma } from "./db";
import { ApiError } from "./errors";

const GB = 1024 * 1024 * 1024;

// O armazenamento é do espaço de trabalho (do plano do admin), não de cada pessoa convidada.
export function workspaceStorageLimit() {
  const raw = Number(process.env.WORKSPACE_STORAGE_LIMIT_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 5 * GB;
}

export async function workspaceStorageUsage(workspaceId: string) {
  const [files, agent] = await Promise.all([
    prisma.attachment.aggregate({
      _sum: { size: true },
      where: { task: { project: { workspaceId } } },
    }),
    prisma.agentMessage.aggregate({
      _sum: { size: true },
      where: { session: { workspaceId } },
    }),
  ]);
  const fileBytes = files._sum.size ?? 0;
  const agentBytes = agent._sum.size ?? 0;
  return {
    files: fileBytes,
    agent: agentBytes,
    total: fileBytes + agentBytes,
    limit: workspaceStorageLimit(),
  };
}

export async function assertStorageAvailable(workspaceId: string, extraBytes: number) {
  if (extraBytes <= 0) return;
  const usage = await workspaceStorageUsage(workspaceId);
  if (usage.total + extraBytes > usage.limit) {
    const limitGb = Math.round((usage.limit / GB) * 10) / 10;
    throw new ApiError(
      413,
      `O espaço de trabalho atingiu o limite de ${limitGb} GB de armazenamento. Apague arquivos ou conversas antigas para liberar espaço.`,
    );
  }
}

export function jsonBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}
