import { Fragment } from "react";

function inline(text: string, keyBase: string) {
  const nodes: React.ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    const token = match[0];
    const key = `${keyBase}-${index++}`;
    if (match[1]) {
      nodes.push(
        <code key={key} className="rounded-md bg-elevated px-1.5 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      nodes.push(
        <strong key={key} className="font-medium text-ink">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (match[3]) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const label = token.slice(1, token.indexOf("]"));
      const href = token.slice(token.indexOf("](") + 2, -1);
      nodes.push(
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-ink"
        >
          {label}
        </a>,
      );
    }
    last = start + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "code"; text: string };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r/g, "").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: "h", text: heading[1] });
      i += 1;
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/;
    const numbered = /^\s*\d+[.)]\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const matcher = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length && matcher.test(lines[i])) {
        items.push(lines[i].match(matcher)![1]);
        i += 1;
      }
      blocks.push({ kind: ordered ? "ol" : "ul", items });
      continue;
    }
    const paragraph: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !bullet.test(lines[i]) &&
      !numbered.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: "p", text: paragraph.join("\n") });
  }
  return blocks;
}

export function Markdown({ text }: { text: string }) {
  const blocks = parse(text);
  return (
    <div className="space-y-3 text-[15px] leading-7 text-ink">
      {blocks.map((block, index) => {
        const key = `b-${index}`;
        if (block.kind === "code") {
          return (
            <pre
              key={key}
              className="overflow-x-auto rounded-2xl bg-elevated px-4 py-3 font-mono text-[13px] leading-6"
            >
              {block.text}
            </pre>
          );
        }
        if (block.kind === "h") {
          return (
            <p key={key} className="pt-1 font-medium text-ink">
              {inline(block.text, key)}
            </p>
          );
        }
        if (block.kind === "ul" || block.kind === "ol") {
          const List = block.kind === "ul" ? "ul" : "ol";
          return (
            <List
              key={key}
              className={
                block.kind === "ul" ? "list-disc space-y-1 pl-5" : "list-decimal space-y-1 pl-5"
              }
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`} className="pl-1 marker:text-faint">
                  {inline(item, `${key}-${itemIndex}`)}
                </li>
              ))}
            </List>
          );
        }
        if (block.kind === "p") {
          return (
            <p key={key} className="whitespace-pre-wrap">
              {block.text.split("\n").map((row: string, rowIndex: number, rows: string[]) => (
                <Fragment key={`${key}-${rowIndex}`}>
                  {inline(row, `${key}-${rowIndex}`)}
                  {rowIndex < rows.length - 1 ? "\n" : null}
                </Fragment>
              ))}
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}
