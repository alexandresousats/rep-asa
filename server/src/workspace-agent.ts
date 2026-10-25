import { normalizeConfig, type AgentConfig } from "./agent";
import type { Actor } from "./domain";
import { prisma } from "./db";
import { ApiError } from "./errors";

function canConfigureWorkspaceAgent(actor: Actor) {
  return actor.access === "admin" || actor.access === "editor";
}

export async function saveWorkspaceAgent(actor: Actor, raw: AgentConfig) {
  if (!canConfigureWorkspaceAgent(actor)) {
    throw new ApiError(403, "Sem permissão para configurar o agente do espaço.");
  }
  if (!actor.workspaceId) throw new ApiError(400, "Nenhum espaço selecionado.");
  const config = await normalizeConfig(raw);
  await prisma.workspace.update({
    where: { id: actor.workspaceId },
    data: {
      agentBaseUrl: config.baseUrl,
      agentModel: config.model,
      agentApiKey: config.apiKey,
    },
  });
  return { ok: true };
}

export async function readWorkspaceAgent(actor: Actor) {
  if (!actor.workspaceId) throw new ApiError(400, "Nenhum espaço selecionado.");
  const workspace = await prisma.workspace.findUnique({
    where: { id: actor.workspaceId },
    select: { agentBaseUrl: true, agentModel: true, agentApiKey: true },
  });
  if (!workspace) throw new ApiError(404, "Espaço não encontrado.");
  return {
    baseUrl: workspace.agentBaseUrl ?? "",
    model: workspace.agentModel ?? "",
    hasApiKey: Boolean(workspace.agentApiKey?.trim()),
  };
}

export async function loadWorkspaceAgentForDemand(workspaceId: string): Promise<AgentConfig | null> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { agentBaseUrl: true, agentModel: true, agentApiKey: true },
  });
  if (!workspace?.agentBaseUrl?.trim() || !workspace.agentApiKey?.trim() || !workspace.agentModel?.trim()) {
    return null;
  }
  try {
    return await normalizeConfig({
      baseUrl: workspace.agentBaseUrl,
      apiKey: workspace.agentApiKey,
      model: workspace.agentModel,
    });
  } catch {
    return null;
  }
}
