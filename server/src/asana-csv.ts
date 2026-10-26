import { parseCsv, serializeCsv, type CsvDelimiter } from "./csv";

export type CsvPriority = "baixa" | "media" | "alta" | "urgente";
export type CsvStatus = "todo" | "doing" | "done";

export type AsanaColumns = {
  taskId: boolean;
  createdAt: boolean;
  completedAt: boolean;
  lastModified: boolean;
  name: boolean;
  section: boolean;
  assignee: boolean;
  startDate: boolean;
  dueDate: boolean;
  tags: boolean;
  notes: boolean;
  projects: boolean;
  parent: boolean;
  blockedBy: boolean;
  blocking: boolean;
  priority: boolean;
  status: boolean;
};

export type CsvTask = {
  rowNumber: number;
  taskId: string;
  createdAt: string | null;
  completedAt: string | null;
  lastModified: string | null;
  name: string;
  section: string;
  assignee: string;
  assigneeEmail: string;
  startDate: string | null;
  dueDate: string | null;
  tags: string[];
  notes: string;
  projectCell: string;
  projects: string[];
  parent: string;
  blockedBy: string[];
  blocking: string[];
  priority: CsvPriority | null;
  status: CsvStatus | null;
  customFields: Record<string, string>;
};

export type ParsedAsanaCsv = {
  tasks: CsvTask[];
  columns: AsanaColumns;
  customFieldNames: string[];
  warnings: string[];
};

export type CsvLinks = {
  parentIndex: number | null;
  blockedBy: number[];
  blocking: number[];
};

export type CsvExportTask = {
  taskId: string;
  createdAt: string;
  completedAt: string;
  lastModified: string;
  name: string;
  section: string;
  assignee: string;
  assigneeEmail: string;
  startDate: string;
  dueDate: string;
  tags: string;
  notes: string;
  projects: string;
  parent: string;
  blockedBy: string;
  blocking: string;
  priority: string;
  status: string;
  customFields: Record<string, string>;
};

const ALIASES: Record<keyof AsanaColumns, string[]> = {
  taskId: ["task id"],
  createdAt: ["created at"],
  completedAt: ["completed at"],
  lastModified: ["last modified"],
  name: ["name", "task name"],
  section: ["section/column", "section", "column"],
  assignee: ["assignee", "assignee email"],
  startDate: ["start date"],
  dueDate: ["due date", "due"],
  tags: ["tags"],
  notes: ["notes", "description"],
  projects: ["projects", "project"],
  parent: ["parent task", "subtask of", "parent"],
  blockedBy: ["blocked by (dependencies)", "blocked by", "dependencies", "dependents"],
  blocking: ["blocking (dependencies)", "blocking"],
  priority: ["priority", "prioridade"],
  status: ["status"],
};

const CONSUMED = new Set(Object.values(ALIASES).flat());

const STANDARD_HEADERS = [
  "Task ID",
  "Created At",
  "Completed At",
  "Last Modified",
  "Name",
  "Section/Column",
  "Assignee",
  "Assignee Email",
  "Start Date",
  "Due Date",
  "Tags",
  "Notes",
  "Projects",
  "Parent task",
  "Blocked By (Dependencies)",
  "Blocking (Dependencies)",
  "Priority",
  "Status",
];

const PRIORITY: Record<string, CsvPriority> = {
  baixa: "baixa",
  low: "baixa",
  media: "media",
  medium: "media",
  alta: "alta",
  high: "alta",
  urgente: "urgente",
  urgent: "urgente",
};

const STATUS: Record<string, CsvStatus> = {
  todo: "todo",
  "a fazer": "todo",
  "to do": "todo",
  "not started": "todo",
  incomplete: "todo",
  open: "todo",
  doing: "doing",
  "em andamento": "doing",
  "in progress": "doing",
  started: "doing",
  done: "done",
  concluido: "done",
  concluida: "done",
  complete: "done",
  completed: "done",
  feito: "done",
};

export function normHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

export function parseAsanaDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return validDate(iso[1], iso[2], iso[3]);
  const slash = raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (!slash) return null;
  const first = Number(slash[1]);
  const second = Number(slash[2]);
  let month = first;
  let day = second;
  if (first > 12 && second <= 12) {
    day = first;
    month = second;
  } else if (second > 12 && first <= 12) {
    month = first;
    day = second;
  }
  return validDate(slash[3], String(month).padStart(2, "0"), String(day).padStart(2, "0"));
}

export function formatAsanaDate(value: string | null | undefined): string {
  if (!value) return "";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

export function htmlToNotes(value: string): string {
  if (!value) return "";
  if (!/<[a-z][\s\S]*>/i.test(value)) return value.trim();
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h2|h3|li|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function notesToHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  return trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseAsanaCsv(text: string): ParsedAsanaCsv {
  const warnings: string[] = [];
  const delimiter = detectDelimiter(text);
  const table = parseCsv(text, delimiter);
  if (table.length === 0) {
    return { tasks: [], columns: emptyColumns(), customFieldNames: [], warnings };
  }

  const headerIndex = table.slice(0, 6).findIndex((row) =>
    row.some((cell) => {
      const key = normHeader(cell);
      return key === "name" || key === "task name" || key === "task id";
    }),
  );
  const headerRow = table[headerIndex >= 0 ? headerIndex : 0] ?? [];
  const headerAt = headerIndex >= 0 ? headerIndex : 0;
  const index = new Map<string, number>();
  const customFieldNames: string[] = [];
  headerRow.forEach((cell, position) => {
    const cleaned = cell.replace(/^\uFEFF/, "").trim();
    const key = normHeader(cleaned);
    if (!key || index.has(key)) return;
    index.set(key, position);
    if (!CONSUMED.has(key)) customFieldNames.push(cleaned);
  });

  const columns = emptyColumns();
  for (const key of Object.keys(ALIASES) as (keyof AsanaColumns)[]) {
    columns[key] = ALIASES[key].some((alias) => index.has(alias));
  }

  const tasks: CsvTask[] = [];
  table.slice(headerAt + 1).forEach((row, offset) => {
    const rowNumber = headerAt + offset + 2;
    const name = read(row, index, "name");
    if (!name) {
      if (row.some((cell) => cell.trim())) {
        warnings.push(`Linha ${rowNumber}: sem nome, então a tarefa foi ignorada.`);
      }
      return;
    }
    const taskId = read(row, index, "taskId").replace(/^"|"$/g, "");
    if (/^\d+(\.\d+)?e\+\d+$/i.test(taskId)) {
      warnings.push(
        `Linha ${rowNumber}: o Task ID parece ter sido encurtado pelo Excel. Importe o CSV original, com a coluna como texto.`,
      );
    }
    const customFields: Record<string, string> = {};
    for (const field of customFieldNames) {
      const position = index.get(normHeader(field));
      customFields[field] = position === undefined ? "" : (row[position] ?? "").trim().slice(0, 4000);
    }
    tasks.push({
      rowNumber,
      taskId: taskId.slice(0, 80),
      createdAt: readDate(row, index, "createdAt", rowNumber, "Created At", warnings),
      completedAt: readDate(row, index, "completedAt", rowNumber, "Completed At", warnings),
      lastModified: readDate(row, index, "lastModified", rowNumber, "Last Modified", warnings),
      name: name.slice(0, 500),
      section: read(row, index, "section").slice(0, 120),
      assignee: cell(row, index, ["assignee"]).slice(0, 200),
      assigneeEmail: cell(row, index, ["assignee email"]).slice(0, 200),
      startDate: readDate(row, index, "startDate", rowNumber, "Start Date", warnings),
      dueDate: readDate(row, index, "dueDate", rowNumber, "Due Date", warnings),
      tags: splitList(read(row, index, "tags")).map((tag) => tag.slice(0, 60)),
      notes: read(row, index, "notes").slice(0, 20_000),
      projectCell: read(row, index, "projects").slice(0, 300),
      projects: splitList(read(row, index, "projects")).map((project) => project.slice(0, 120)),
      parent: read(row, index, "parent").slice(0, 500),
      blockedBy: splitList(read(row, index, "blockedBy")),
      blocking: splitList(read(row, index, "blocking")),
      priority: readEnum(row, index, "priority", PRIORITY, rowNumber, "Priority", warnings),
      status: readEnum(row, index, "status", STATUS, rowNumber, "Status", warnings),
      customFields,
    });
    if (name.length > 500) warnings.push(`Linha ${rowNumber}: o nome foi cortado em 500 caracteres.`);
  });

  return { tasks, columns, customFieldNames, warnings };
}

export function linkCsvTasks(tasks: CsvTask[]): CsvLinks[] {
  return tasks.map((task, index) => ({
    parentIndex: task.parent ? findTask(task.parent, index, tasks) : null,
    blockedBy: uniqueIndexes(task.blockedBy.map((token) => findTask(token, index, tasks))),
    blocking: uniqueIndexes(task.blocking.map((token) => findTask(token, index, tasks))),
  }));
}

export function tasksToAsanaCsv(tasks: CsvExportTask[]): string {
  const customFieldNames: string[] = [];
  const seen = new Set<string>();
  for (const task of tasks) {
    for (const key of Object.keys(task.customFields)) {
      const norm = normHeader(key);
      if (!norm || CONSUMED.has(norm) || seen.has(norm)) continue;
      seen.add(norm);
      customFieldNames.push(key);
    }
  }
  const header = [...STANDARD_HEADERS, ...customFieldNames];
  const rows = [
    header,
    ...tasks.map((task) => [
      task.taskId,
      task.createdAt,
      task.completedAt,
      task.lastModified,
      task.name,
      task.section,
      task.assignee,
      task.assigneeEmail,
      task.startDate,
      task.dueDate,
      task.tags,
      task.notes,
      task.projects,
      task.parent,
      task.blockedBy,
      task.blocking,
      task.priority,
      task.status,
      ...customFieldNames.map((name) => task.customFields[name] ?? ""),
    ]),
  ];
  return serializeCsv(rows, { quoteColumns: [0] });
}

export function csvFileName(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${clean || "tarefas"}.csv`;
}

function findTask(token: string, fromIndex: number, tasks: CsvTask[]): number | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const byId = tasks.findIndex((task, index) => index !== fromIndex && task.taskId && task.taskId === trimmed);
  if (byId >= 0) return byId;
  const folded = fold(trimmed);
  const above = search(fromIndex - 1, -1, -1, tasks, trimmed, folded);
  if (above >= 0) return above;
  return search(fromIndex + 1, tasks.length, 1, tasks, trimmed, folded);
}

function search(
  start: number,
  end: number,
  step: number,
  tasks: CsvTask[],
  exact: string,
  folded: string,
): number {
  for (let index = start; index !== end; index += step) {
    if (tasks[index]?.name === exact) return index;
  }
  for (let index = start; index !== end; index += step) {
    if (fold(tasks[index]?.name ?? "") === folded) return index;
  }
  return -1;
}

function uniqueIndexes(values: Array<number | null>): number[] {
  const seen = new Set<number>();
  for (const value of values) {
    if (value !== null) seen.add(value);
  }
  return [...seen];
}

function detectDelimiter(text: string): CsvDelimiter {
  const sample = text.replace(/^\uFEFF/, "");
  let best: CsvDelimiter = ",";
  let bestScore = -1;
  for (const delimiter of [",", ";", "\t"] as const) {
    const rows = parseCsv(sample, delimiter);
    const header = rows.slice(0, 6).find((row) =>
      row.some((cell) => {
        const key = normHeader(cell);
        return key === "name" || key === "task name" || key === "task id";
      }),
    );
    if (!header) continue;
    const keys = new Set(header.map((cell) => normHeader(cell)));
    let score = 0;
    if (keys.has("name") || keys.has("task name")) score += 4;
    if (keys.has("task id")) score += 2;
    if (keys.has("projects") || keys.has("due date") || keys.has("notes")) score += 1;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

function emptyColumns(): AsanaColumns {
  return {
    taskId: false,
    createdAt: false,
    completedAt: false,
    lastModified: false,
    name: false,
    section: false,
    assignee: false,
    startDate: false,
    dueDate: false,
    tags: false,
    notes: false,
    projects: false,
    parent: false,
    blockedBy: false,
    blocking: false,
    priority: false,
    status: false,
  };
}

function read(row: string[], index: Map<string, number>, key: keyof AsanaColumns): string {
  return cell(row, index, ALIASES[key]);
}

function cell(row: string[], index: Map<string, number>, aliases: string[]): string {
  for (const alias of aliases) {
    const position = index.get(alias);
    if (position !== undefined) return (row[position] ?? "").trim();
  }
  return "";
}

function readDate(
  row: string[],
  index: Map<string, number>,
  key: keyof AsanaColumns,
  rowNumber: number,
  label: string,
  warnings: string[],
): string | null {
  const raw = read(row, index, key);
  if (!raw) return null;
  const parsed = parseAsanaDate(raw);
  if (!parsed) warnings.push(`Linha ${rowNumber}: data inválida em ${label}.`);
  return parsed;
}

function readEnum<T extends string>(
  row: string[],
  index: Map<string, number>,
  key: keyof AsanaColumns,
  table: Record<string, T>,
  rowNumber: number,
  label: string,
  warnings: string[],
): T | null {
  const raw = read(row, index, key);
  if (!raw) return null;
  const parsed = table[fold(raw)];
  if (!parsed) warnings.push(`Linha ${rowNumber}: valor de ${label} desconhecido (${raw}).`);
  return parsed ?? null;
}

function validDate(year: string, month: string, day: string): string | null {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}
