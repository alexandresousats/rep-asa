import type { Actor } from "./domain";
import { todayISO } from "./crypto";
import { ApiError } from "./errors";
import { callTool, tools } from "./mcp";

export type AgentConfig = { baseUrl: string; apiKey: string; model: string };

export type ChatDocumentTurn = {
  name: string;
  size: number;
  type?: string;
  pageCount?: number;
  text: string;
  pageImages?: string[];
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  images?: string[];
  documents?: ChatDocumentTurn[];
};

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; ok: boolean; mutated: boolean }
  | { type: "error"; message: string }
  | { type: "done" };

type ToolCall = { id: string; name: string; arguments: string };

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ProviderMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentPart[] }
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
  "list_tags",
  "create_tag",
  "update_tag",
  "delete_tag",
  "set_task_tags",
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
  "create_tag",
  "update_tag",
  "delete_tag",
  "set_task_tags",
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
    "Você cria e gerencia tarefas e tags por meio das ferramentas. Nunca invente ids: chame list_projects, list_tasks, list_tags ou list_team antes de usá-los. Em tags, o nome também serve no lugar do id.",
    "Para atribuir tags a uma tarefa, use set_task_tags ou tagIds em create_task e update_task. set_task_tags substitui a lista inteira: para acrescentar, inclua as tags que já estavam.",
    "Quando o pedido for claro, execute direto. Se faltar algo essencial (por exemplo, em qual projeto criar), pergunte em uma frase. Se o usuário não indicar responsável, deixe o padrão.",
    "Depois de executar, confirme em poucas linhas o que foi feito, citando título, projeto, tags e prazo. Use listas curtas quando ajudar.",
    canWrite
      ? "Você pode criar, renomear, recolorir, excluir e atribuir tags. Não exclua projetos, tarefas nem pessoas: isso fica na interface."
      : "O usuário só tem permissão de leitura ou acesso limitado. Se uma ferramenta recusar a ação, explique o motivo.",
    "PDFs exportados como imagem (Illustrator, slides) chegam com as páginas anexadas como imagens, na ordem. Leia esse conteúdo visual — títulos, datas, tags e tarefas — e não diga que o arquivo está vazio só porque não há texto selecionável.",
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
        tagIds: Array.isArray(item.tagIds) ? item.tagIds : [],
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
    ...turns.slice(-30).map((turn) => {
      if (turn.role === "user") {
        let textContent = turn.content;

        const pageImages: string[] = [];
        if (turn.documents && turn.documents.length > 0) {
          const docSections = turn.documents
            .map((doc) => {
              if (doc.pageImages?.length) pageImages.push(...doc.pageImages);
              const sizeMb = (doc.size / (1024 * 1024)).toFixed(1);
              const meta = [
                `Arquivo: "${doc.name}"`,
                `Tamanho: ${sizeMb} MB`,
                doc.pageCount ? `Páginas: ${doc.pageCount}` : null,
              ]
                .filter(Boolean)
                .join(" · ");

              const visual = doc.pageImages?.length
                ? `Este PDF não tem texto selecionável. Leia as ${doc.pageImages.length} imagens de página que acompanham esta mensagem, na ordem.`
                : null;

              return `[DOCUMENTO ANEXADO PELO USUÁRIO PARA ANÁLISE: ${meta}]${visual ? `\n${visual}` : ""}\n--- Início do Conteúdo do Documento ---\n${doc.text}\n--- Fim do Conteúdo do Documento ---`;
            })
            .join("\n\n");

          textContent = textContent
            ? `${docSections}\n\n${textContent}`
            : `${docSections}\n\nPor favor, analise o(s) documento(s) anexado(s) acima e responda em detalhes de acordo com a solicitação.`;
        }

        const photos = turn.images ?? [];
        const images = [...photos, ...pageImages];
        if (pageImages.length > 0) {
          const order = photos.length
            ? `As primeiras ${photos.length} imagens são fotos anexadas. As ${pageImages.length} seguintes são as páginas do PDF, na ordem.`
            : `As ${images.length} imagens desta mensagem são as páginas do PDF, na ordem.`;
          textContent = `${textContent}\n\n${order}`;
        }

        if (images.length > 0) {
          return {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: textContent || "Analise a imagem anexada.",
              },
              ...images.map((url) => ({
                type: "image_url" as const,
                image_url: { url },
              })),
            ],
          };
        }

        return { role: "user" as const, content: textContent };
      }

      return { role: turn.role, content: turn.content } as ProviderMessage;
    }),
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
  const reply = await completeOneShot(
    config,
    "Responda em uma palavra.",
    "Responda apenas: ok",
  );
  return { ok: true, reply };
}

export async function completeOneShot(
  config: AgentConfig,
  system: string,
  user: string,
): Promise<string> {
  const normalized = normalizeConfig(config);
  const response = await postCompletion(normalized, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
    temperature: 0,
  });
  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : content;
}
