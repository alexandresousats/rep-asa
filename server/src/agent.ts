import type { Actor } from "./domain";
import { todayISO } from "./crypto";
import { ApiError } from "./errors";
import { callTool, tools } from "./mcp";

export type AgentConfig = { baseUrl: string; apiKey: string; model: string };
export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; ok: boolean; mutated: boolean }
  | { type: "error"; message: string }
  | { type: "done" };

type ToolCall = { id: string; name: string; arguments: string };

type ProviderMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

// Ferramentas liberadas para o chat. Ações destrutivas (excluir) ficam de fora de propósito.
const CHAT_TOOLS = new Set([
  "list_projects",
  "list_tasks",
  "get_task",
  "list_team",
  "create_task",
  "create_subtask",
  "update_task",
  "set_task_status",
  "assign_task",
  "add_comment",
  "create_project",
  "add_project_member",
]);

const MUTATING = new Set([
  "create_task",
  "create_subtask",
  "update_task",
  "set_task_status",
  "assign_task",
  "add_comment",
  "create_project",
  "add_project_member",
]);

const MAX_ROUNDS = 8;
const MAX_TOOL_CHARS = 16000;

function toolDefinitions() {
  return tools
    .filter((tool) => CHAT_TOOLS.has(tool.name))
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
}

export function normalizeConfig(config: AgentConfig): AgentConfig {
  const baseUrl = config.baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/, "");
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new ApiError(400, "A URL do agente precisa começar com http:// ou https://.");
  }
  if (!config.apiKey.trim()) throw new ApiError(400, "Informe a chave de API do agente.");
  if (!config.model.trim()) throw new ApiError(400, "Informe o modelo do agente.");
  return { baseUrl, apiKey: config.apiKey.trim(), model: config.model.trim() };
}

function systemPrompt(actor: Actor) {
  const weekday = new Date().toLocaleDateString("pt-BR", { weekday: "long" });
  const canWrite = actor.access === "admin" || actor.access === "editor";
  return [
    "Você é o agente do ASA, um app de gestão de projetos e tarefas. Responda sempre em português do Brasil, de forma curta e direta.",
    `Hoje é ${weekday}, ${todayISO()} (formato AAAA-MM-DD). Converta datas relativas como "amanhã" ou "sexta" para AAAA-MM-DD.`,
    `Usuário: ${actor.name} (id ${actor.id}), acesso "${actor.access}", espaço de trabalho "${actor.workspaceName ?? "nenhum"}".`,
    "Você cria e gerencia tarefas por meio das ferramentas. Nunca invente ids: chame list_projects, list_tasks ou list_team para descobrir projetos, tarefas e pessoas antes de usá-los.",
    "Quando o pedido for claro, execute direto. Se faltar algo essencial (por exemplo, em qual projeto criar), pergunte em uma frase. Se o usuário não indicar responsável, deixe o padrão.",
    "Depois de executar, confirme em poucas linhas o que foi feito, citando título, projeto e prazo. Use listas curtas quando ajudar.",
    canWrite
      ? "Você não pode excluir nada. Se pedirem para excluir, explique que isso deve ser feito pela interface."
      : "O usuário só tem permissão de leitura ou acesso limitado. Se uma ferramenta recusar a ação, explique o motivo.",
  ].join("\n");
}

function providerError(status: number, body: string) {
  let detail = body.trim().slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const message =
      typeof parsed.error === "string" ? parsed.error : (parsed.error?.message ?? parsed.message);
    if (message) detail = message;
  } catch {
    // Mantém o texto bruto.
  }
  if (status === 401 || status === 403) {
    return new ApiError(502, `O provedor recusou a chave de API. ${detail}`.trim());
  }
  if (status === 404) {
    return new ApiError(
      502,
      `Endereço ou modelo não encontrado. Confira a URL base e o nome do modelo. ${detail}`.trim(),
    );
  }
  if (status === 429) {
    return new ApiError(502, `Limite de uso do provedor atingido. ${detail}`.trim());
  }
  return new ApiError(502, `O provedor respondeu ${status}. ${detail}`.trim());
}

async function postCompletion(
  config: AgentConfig,
  body: Record<string, unknown>,
  signal?: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model: config.model, ...body }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    let host = config.baseUrl;
    try {
      host = new URL(config.baseUrl).host;
    } catch {
      // Usa a URL como veio.
    }
    throw new ApiError(502, `Não foi possível conectar a ${host}.`);
  }
  if (!response.ok) throw providerError(response.status, await response.text());
  return response;
}

async function streamCompletion(
  config: AgentConfig,
  messages: ProviderMessage[],
  emit: (event: AgentEvent) => void,
  signal: AbortSignal,
) {
  const response = await postCompletion(
    config,
    { messages, tools: toolDefinitions(), stream: true },
    signal,
  );
  if (!response.body) throw new ApiError(502, "O provedor não enviou resposta.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const calls: ToolCall[] = [];
  let content = "";
  let buffer = "";

  function consume(line: string) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let chunk: {
      choices?: {
        delta?: {
          content?: string | null;
          tool_calls?: {
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
      }[];
      error?: { message?: string };
    };
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    if (chunk.error?.message) throw new ApiError(502, chunk.error.message);
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;
    if (delta.content) {
      content += delta.content;
      emit({ type: "text", delta: delta.content });
    }
    for (const part of delta.tool_calls ?? []) {
      const index = part.index ?? 0;
      const call = (calls[index] ??= { id: "", name: "", arguments: "" });
      if (part.id) call.id = part.id;
      if (part.function?.name) call.name += part.function.name;
      if (part.function?.arguments) call.arguments += part.function.arguments;
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consume(line);
  }
  if (buffer) consume(buffer);

  return {
    content,
    calls: calls
      .filter((call) => call?.name)
      .map((call, index) => ({ ...call, id: call.id || `call_${Date.now()}_${index}` })),
  };
}

function shapeResult(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shapeResult);
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    if ("projectId" in item && "title" in item && "status" in item) {
      return {
        id: item.id,
        title: item.title,
        projectId: item.projectId,
        parentId: item.parentId ?? null,
        assigneeId: item.assigneeId,
        dueDate: item.dueDate,
        priority: item.priority,
        status: item.status,
        section: item.section,
      };
    }
  }
  return value;
}

function stringifyResult(value: unknown) {
  const text = JSON.stringify(shapeResult(value));
  if (text.length <= MAX_TOOL_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_CHARS)}… [resultado cortado]`;
}

export async function runAgent(
  actor: Actor,
  rawConfig: AgentConfig,
  turns: ChatTurn[],
  emit: (event: AgentEvent) => void,
  signal: AbortSignal,
) {
  const config = normalizeConfig(rawConfig);
  const messages: ProviderMessage[] = [
    { role: "system", content: systemPrompt(actor) },
    ...turns.slice(-30).map((turn) => ({ role: turn.role, content: turn.content }) as ProviderMessage),
  ];

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const { content, calls } = await streamCompletion(config, messages, emit, signal);
    if (calls.length === 0) return;

    messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments || "{}" },
      })),
    });

    for (const call of calls) {
      let args: Record<string, unknown> = {};
      let parsedOk = true;
      try {
        const parsed = JSON.parse(call.arguments || "{}");
        if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>;
      } catch {
        parsedOk = false;
      }
      emit({ type: "tool", id: call.id, name: call.name, args });

      let ok = true;
      let output: string;
      if (!CHAT_TOOLS.has(call.name)) {
        ok = false;
        output = "Ferramenta indisponível no chat.";
      } else if (!parsedOk) {
        ok = false;
        output = "Argumentos inválidos: envie um JSON válido.";
      } else {
        try {
          output = stringifyResult(await callTool(actor, call.name, args));
        } catch (error) {
          ok = false;
          output = error instanceof ApiError ? error.message : "Não foi possível executar.";
        }
      }
      emit({ type: "tool_result", id: call.id, ok, mutated: ok && MUTATING.has(call.name) });
      messages.push({ role: "tool", tool_call_id: call.id, content: output });
    }
  }

  emit({
    type: "text",
    delta: "\n\nParei por aqui após várias ações seguidas. Diga se devo continuar.",
  });
}

export async function testAgent(rawConfig: AgentConfig) {
  const config = normalizeConfig(rawConfig);
  const response = await postCompletion(config, {
    messages: [{ role: "user", content: "Responda apenas: ok" }],
    stream: false,
  });
  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  return { ok: true, reply: data.choices?.[0]?.message?.content?.trim() ?? "" };
}
