import type { Actor } from "./domain";
import {
  addComment,
  addProjectMember,
  addSubtask,
  createProject,
  createTask,
  deleteProject,
  deleteTask,
  listNotifications,
  listProjects,
  listTasks,
  listTeam,
  listWorkspaces,
  markNotificationRead,
  removeMember,
  selectApiKeyWorkspace,
  updateTask,
} from "./domain";
import { ApiError } from "./errors";

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
};

const protocolVersion = "2025-03-26";

export const tools = [
  {
    name: "list_workspaces",
    description:
      "Lista os espaços de trabalho da conta e marca qual está selecionado. Consulte isto para saber o nome e o id de cada espaço.",
    inputSchema: { type: "object", properties: {} },
    admin: false,
  },
  {
    name: "select_workspace",
    description:
      "Escolhe o espaço de trabalho desta chave. As próximas consultas e alterações de projetos, tarefas e equipe usam esse espaço. Passe o id retornado por list_workspaces.",
    inputSchema: {
      type: "object",
      properties: { workspaceId: { type: "string", description: "Id do espaço de trabalho." } },
      required: ["workspaceId"],
    },
    admin: false,
  },
  {
    name: "list_projects",
    description: "Lista os projetos do espaço de trabalho selecionado.",
    inputSchema: { type: "object", properties: {} },
    admin: false,
  },
  {
    name: "list_tasks",
    description:
      "Lista as tarefas visíveis, inclusive subtarefas. Uma subtarefa tem parentId preenchido. Editor e leitura só recebem as tarefas atribuídas a si.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
    },
    admin: false,
  },
  {
    name: "get_task",
    description: "Detalha uma tarefa visível para o usuário.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    admin: false,
  },
  {
    name: "update_task",
    description: "Atualiza uma tarefa visível. Não altera o responsável.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        dueDate: { type: "string" },
        startDate: { type: "string" },
        priority: { type: "string", enum: ["baixa", "media", "alta", "urgente"] },
        status: { type: "string", enum: ["todo", "doing", "done"] },
        section: { type: "string" },
      },
      required: ["id"],
    },
    admin: false,
  },
  {
    name: "set_task_status",
    description: "Muda o status de uma tarefa visível.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["todo", "doing", "done"] },
      },
      required: ["id", "status"],
    },
    admin: false,
  },
  {
    name: "add_comment",
    description: "Comenta numa tarefa visível.",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" }, body: { type: "string" } },
      required: ["taskId", "body"],
    },
    admin: false,
  },
  {
    name: "list_notifications",
    description: "Lista as notificações do usuário autenticado.",
    inputSchema: { type: "object", properties: {} },
    admin: false,
  },
  {
    name: "mark_notification_read",
    description: "Marca uma notificação como lida.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    admin: false,
  },
  {
    name: "create_project",
    description: "Cria um projeto. Somente administrador.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        color: { type: "string" },
      },
      required: ["name"],
    },
    admin: true,
  },
  {
    name: "create_subtask",
    description:
      "Cria uma subtarefa dentro de uma tarefa. Passe o id da tarefa pai, o título e, se pedido, dueDate no formato AAAA-MM-DD. Use isto quando pedirem uma subtarefa, um item filho ou um vencimento no dia seguinte. Somente administrador.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Id da tarefa pai." },
        title: { type: "string" },
        dueDate: { type: "string", description: "Vencimento AAAA-MM-DD." },
      },
      required: ["taskId", "title"],
    },
    admin: true,
  },
  {
    name: "create_task",
    description: "Cria uma tarefa num projeto. Para subtarefa, use create_subtask. Somente administrador.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        assigneeId: { type: "string" },
        dueDate: { type: "string" },
        section: { type: "string" },
        priority: { type: "string", enum: ["baixa", "media", "alta", "urgente"] },
      },
      required: ["projectId", "title"],
    },
    admin: true,
  },
  {
    name: "assign_task",
    description: "Atribui uma tarefa a um membro do projeto. Somente administrador.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, assigneeId: { type: "string" } },
      required: ["id", "assigneeId"],
    },
    admin: true,
  },
  {
    name: "add_project_member",
    description:
      "Inclui no projeto uma pessoa que já faz parte do espaço de trabalho. É a ação do menu Adicionar → Membro na página do projeto. Não envia convite: quem ainda não aceitou o espaço não pode entrar no projeto. Somente administrador.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, userId: { type: "string" } },
      required: ["projectId", "userId"],
    },
    admin: true,
  },
  {
    name: "list_team",
    description: "Lista a equipe. Somente administrador.",
    inputSchema: { type: "object", properties: {} },
    admin: true,
  },
  {
    name: "delete_project",
    description: "Exclui um projeto e as tarefas dele. Somente administrador.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    admin: true,
  },
  {
    name: "delete_task",
    description: "Exclui uma tarefa e as subtarefas dela. Somente administrador.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    admin: true,
  },
  {
    name: "remove_team_member",
    description:
      "Remove uma pessoa do espaço de trabalho atual. Não apaga a conta. O dono do espaço não pode ser removido. Somente administrador.",
    inputSchema: {
      type: "object",
      properties: { userId: { type: "string" } },
      required: ["userId"],
    },
    admin: true,
  },
];

async function workspaceInstructions(actor: Actor) {
  try {
    const listed = await listWorkspaces(actor);
    const current = listed.workspaces.find((item) => item.current);
    const names = listed.workspaces.map((item) => `${item.name} (${item.id})`).join(", ");
    const selected = current
      ? `O espaço selecionado é "${current.name}" (${current.id}).`
      : "Nenhum espaço está selecionado.";
    return `${selected} Espaços desta conta: ${names || "nenhum"}. Use list_workspaces para vê-los e select_workspace para escolher outro. Projetos, tarefas e equipe são sempre do espaço selecionado. add_project_member coloca no projeto alguém que já está no espaço; o convite da equipe só entra no espaço e não inclui a pessoa no projeto. Para criar subtarefa, use create_subtask com o id da tarefa pai, o título e dueDate em AAAA-MM-DD.`;
  } catch {
    return "Use list_workspaces para ver os espaços de trabalho e select_workspace para escolher em qual trabalhar.";
  }
}

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function arg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

export async function callTool(actor: Actor, name: string, args: Record<string, unknown>) {
  const tool = tools.find((item) => item.name === name);
  if (!tool) throw new ApiError(400, "Ferramenta desconhecida.");
  if (tool.admin && actor.access !== "admin") {
    const space = actor.workspaceName ? ` no espaço "${actor.workspaceName}"` : "";
    throw new ApiError(
      403,
      `Só um administrador pode usar esta ferramenta. Seu acesso${space} é ${actor.access}. Use list_workspaces e select_workspace para entrar num espaço em que você é administrador.`,
    );
  }
  switch (name) {
    case "list_workspaces":
      return listWorkspaces(actor);
    case "select_workspace": {
      const workspaceId = arg(args, "workspaceId") || arg(args, "id");
      if (!workspaceId) throw new ApiError(400, "Informe o id do espaço de trabalho.");
      return selectApiKeyWorkspace(actor, workspaceId);
    }
    case "list_projects":
      return listProjects(actor);
    case "list_tasks":
      return listTasks(actor, arg(args, "projectId") || undefined);
    case "get_task": {
      const tasks = await listTasks(actor);
      const task = tasks.find((item) => item.id === arg(args, "id"));
      if (!task) throw new ApiError(404, "Tarefa não encontrada.");
      return task;
    }
    case "update_task":
      return updateTask(actor, arg(args, "id"), {
        title: typeof args.title === "string" ? args.title : undefined,
        description: typeof args.description === "string" ? args.description : undefined,
        dueDate: typeof args.dueDate === "string" ? args.dueDate : undefined,
        startDate: typeof args.startDate === "string" ? args.startDate : undefined,
        priority: typeof args.priority === "string" ? (args.priority as "baixa") : undefined,
        status: typeof args.status === "string" ? (args.status as "todo") : undefined,
        section: typeof args.section === "string" ? args.section : undefined,
      });
    case "set_task_status":
      return updateTask(actor, arg(args, "id"), {
        status: arg(args, "status") as "todo",
      });
    case "add_comment":
      return addComment(actor, arg(args, "taskId"), arg(args, "body"));
    case "list_notifications":
      return listNotifications(actor);
    case "mark_notification_read":
      return markNotificationRead(actor, arg(args, "id"));
    case "create_project":
      return createProject(actor, {
        name: arg(args, "name"),
        description: typeof args.description === "string" ? args.description : "",
        color: typeof args.color === "string" ? args.color : "#a78bfa",
      });
    case "create_subtask":
      return addSubtask(
        actor,
        arg(args, "taskId") || arg(args, "parentId") || arg(args, "id"),
        arg(args, "title"),
        typeof args.dueDate === "string" ? args.dueDate : null,
      );
    case "create_task":
      return createTask(actor, {
        projectId: arg(args, "projectId"),
        title: arg(args, "title"),
        description: typeof args.description === "string" ? args.description : "",
        assigneeId: typeof args.assigneeId === "string" ? args.assigneeId : undefined,
        dueDate: typeof args.dueDate === "string" ? args.dueDate : null,
        section: typeof args.section === "string" ? args.section : undefined,
        priority: typeof args.priority === "string" ? (args.priority as "media") : undefined,
      });
    case "assign_task":
      return updateTask(actor, arg(args, "id"), { assigneeId: arg(args, "assigneeId") });
    case "add_project_member":
      return addProjectMember(actor, arg(args, "projectId"), arg(args, "userId"));
    case "list_team":
      return listTeam(actor);
    case "delete_project":
      await deleteProject(actor, arg(args, "id"));
      return { ok: true };
    case "delete_task":
      await deleteTask(actor, arg(args, "id"));
      return { ok: true };
    case "remove_team_member":
      await removeMember(actor, arg(args, "userId") || arg(args, "id"));
      return { ok: true };
    default:
      throw new ApiError(400, "Ferramenta desconhecida.");
  }
}

export async function handleMcpMessage(actor: Actor, message: JsonRpc) {
  const method = message.method ?? "";
  if (method === "initialize") {
    return {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "asa", version: "0.1.0" },
      instructions: await workspaceInstructions(actor),
    };
  }
  if (method === "ping") return {};
  if (method === "tools/list") {
    return {
      tools: tools.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    };
  }
  if (method === "tools/call") {
    const name = message.params?.name ?? "";
    const args = message.params?.arguments ?? {};
    try {
      return text(await callTool(actor, name, args));
    } catch (error) {
      const detail = error instanceof ApiError ? error.message : "Não foi possível executar.";
      return { content: [{ type: "text" as const, text: detail }], isError: true };
    }
  }
  if (method.startsWith("notifications/")) return undefined;
  throw new ApiError(400, "Método não suportado.");
}

export function rpcError(id: JsonRpc["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
