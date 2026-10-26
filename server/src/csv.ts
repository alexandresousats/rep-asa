export type CsvDelimiter = "," | ";" | "\t";

export function parseCsv(text: string, delimiter: CsvDelimiter = ","): string[][] {
  const input = text
    .replace(/^\uFEFF/, "")
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
          continue;
        }
        quoted = false;
        continue;
      }
      field += char;
      continue;
    }
    if (char === '"' && field === "") {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }
  return rows;
}

export function serializeCsv(
  rows: string[][],
  options?: { quoteColumns?: number[]; delimiter?: CsvDelimiter },
): string {
  const delimiter = options?.delimiter ?? ",";
  const quoteColumns = new Set(options?.quoteColumns ?? []);
  const body = rows
    .map((row) =>
      row
        .map((value, column) => escapeCell(value, delimiter, quoteColumns.has(column) && value.length > 0))
        .join(delimiter),
    )
    .join("\r\n");
  return `\uFEFF${body}\r\n`;
}

function escapeCell(value: string, delimiter: string, force: boolean): string {
  if (
    force ||
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
