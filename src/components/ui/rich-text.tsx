"use client";

import {
  Bold,
  ChevronDown,
  Code,
  Highlighter,
  Italic,
  Link2,
  List,
  MoreHorizontal,
  Plus,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  highlightStyle,
  plainTextToEditorHtml,
  RICH_TEXT_MARK,
  RICH_TEXT_MIME,
  stripExternalPasteHtml,
} from "@/lib/paste-html";

const BLOCKS = [
  { label: "Texto padrão", value: "p" },
  { label: "Título", value: "h2" },
  { label: "Subtítulo", value: "h3" },
];

function plainToHtml(value: string) {
  if (!value) return "";
  if (/<[a-z][\s\S]*>/i.test(value)) return value;
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

const RICH_TEXT_PURIFY = {
  ALLOWED_TAGS: [
    "a",
    "b",
    "strong",
    "i",
    "em",
    "u",
    "s",
    "strike",
    "del",
    "code",
    "pre",
    "p",
    "br",
    "div",
    "span",
    "h2",
    "h3",
    "blockquote",
    "ul",
    "ol",
    "li",
    "mark",
  ],
  ALLOWED_ATTR: ["href", "style"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
};

let purifyHooked = false;

async function sanitizeEditorHtml(value: string) {
  const { default: DOMPurify } = await import("dompurify");
  if (!purifyHooked) {
    purifyHooked = true;
    DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
      if (data.attrName !== "style") return;
      const next = highlightStyle(data.attrValue);
      if (!next) {
        data.keepAttr = false;
        return;
      }
      data.attrValue = next;
    });
  }
  return DOMPurify.sanitize(plainToHtml(value), RICH_TEXT_PURIFY);
}

export function RichText({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState(false);
  const plainPasteRef = useRef(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    let cancelled = false;
    void sanitizeEditorHtml(value).then((html) => {
      if (cancelled || !editorRef.current || document.activeElement === editorRef.current) return;
      if (editorRef.current.innerHTML !== html) editorRef.current.innerHTML = html;
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  function run(command: string, arg?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    publish();
  }

  function publish() {
    const html = editorRef.current?.innerHTML ?? "";
    const empty = !editorRef.current?.textContent?.trim();
    onChange(empty ? "" : html);
    setMenu((editorRef.current?.textContent ?? "").trim() === "/");
  }

  function insertHtml(html: string) {
    const editor = editorRef.current;
    if (!html || !editor) return;
    editor.focus();
    const selection = document.getSelection();
    const range =
      selection && selection.rangeCount > 0 && editor.contains(selection.getRangeAt(0).commonAncestorContainer)
        ? selection.getRangeAt(0)
        : null;
    if (!range) {
      editor.insertAdjacentHTML("beforeend", html);
    } else {
      range.deleteContents();
      const template = document.createElement("template");
      template.innerHTML = html;
      const fragment = template.content;
      const last = fragment.lastChild;
      range.insertNode(fragment);
      if (last) {
        range.setStartAfter(last);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    publish();
  }

  function writeInternalClipboard(event: React.ClipboardEvent<HTMLDivElement>) {
    const editor = editorRef.current;
    const selection = document.getSelection();
    if (!editor || !selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const holder = document.createElement("div");
    holder.appendChild(range.cloneContents());
    event.clipboardData.setData("text/html", `${RICH_TEXT_MARK}${holder.innerHTML}`);
    event.clipboardData.setData("text/plain", selection.toString());
    event.clipboardData.setData(RICH_TEXT_MIME, "1");
    event.preventDefault();
  }

  function handleCopy(event: React.ClipboardEvent<HTMLDivElement>) {
    writeInternalClipboard(event);
  }

  function handleCut(event: React.ClipboardEvent<HTMLDivElement>) {
    writeInternalClipboard(event);
    if (!event.defaultPrevented) return;
    document.execCommand("delete");
    publish();
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const shiftKey = (event.nativeEvent as { shiftKey?: boolean }).shiftKey === true;
    const plainShortcut = plainPasteRef.current || shiftKey;
    plainPasteRef.current = false;
    const data = event.clipboardData;
    if (!data) return;
    const plain = data.getData("text/plain");
    const html = data.getData("text/html");
    const internal =
      data.getData(RICH_TEXT_MIME) === "1" || html.includes(RICH_TEXT_MARK);
    if (plainShortcut || !html) {
      insertHtml(plainTextToEditorHtml(plain));
      return;
    }
    if (internal) {
      const cleaned = await sanitizeEditorHtml(html.replaceAll(RICH_TEXT_MARK, ""));
      insertHtml(cleaned);
      return;
    }
    insertHtml(stripExternalPasteHtml(html) || plainTextToEditorHtml(plain));
  }

  return (
    <div
      ref={rootRef}
      className={cn("rounded-xl", active && "border border-line bg-base")}
      onFocus={() => setActive(true)}
      onBlur={(event) => {
        if (rootRef.current?.contains(event.relatedTarget as Node)) return;
        setActive(false);
        setMenu(false);
        setMore(false);
      }}
    >
      {active ? (
        <div className="flex items-center gap-0.5 overflow-x-auto border-b border-line px-2 py-1.5">
          <ToolButton label="Inserir" onClick={() => setMenu((open) => !open)}>
            <Plus className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Desfazer" onClick={() => run("undo")}>
            <Undo2 className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Refazer" onClick={() => run("redo")}>
            <Redo2 className="h-3.5 w-3.5" />
          </ToolButton>
          <span className="mx-1 h-4 w-px bg-line" />
          <label className="relative">
            <select
              aria-label="Estilo do texto"
              defaultValue="p"
              onMouseDown={(event) => event.stopPropagation()}
              onChange={(event) => run("formatBlock", event.target.value)}
              className="h-7 appearance-none rounded-md bg-transparent pr-6 pl-2 text-xs text-ink outline-none hover:bg-hover"
            >
              {BLOCKS.map((block) => (
                <option key={block.value} value={block.value}>
                  {block.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1.5 right-1 h-3.5 w-3.5 text-faint" />
          </label>
          <span className="mx-1 h-4 w-px bg-line" />
          <ToolButton label="Negrito" onClick={() => run("bold")}>
            <Bold className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Itálico" onClick={() => run("italic")}>
            <Italic className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Riscado" onClick={() => run("strikeThrough")}>
            <Strikethrough className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Sublinhado" onClick={() => run("underline")}>
            <Underline className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            label="Link"
            onClick={() => {
              const href = window.prompt("Endereço do link");
              if (href) run("createLink", href);
            }}
          >
            <Link2 className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Realce" onClick={() => run("hiliteColor", "#fde68a")}>
            <Highlighter className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Código" onClick={() => run("insertHTML", "<code>código</code>")}>
            <Code className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Lista" onClick={() => run("insertUnorderedList")}>
            <List className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton label="Mais" onClick={() => setMore((open) => !open)}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </ToolButton>
        </div>
      ) : null}

      {menu ? (
        <div className="border-b border-line px-2 py-1">
          {BLOCKS.map((block) => (
            <button
              key={block.value}
              type="button"
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-hover"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                if ((editorRef.current?.textContent ?? "").trim() === "/") {
                  editorRef.current!.innerHTML = "";
                }
                run("formatBlock", block.value);
                setMenu(false);
              }}
            >
              {block.label}
            </button>
          ))}
        </div>
      ) : null}

      {more ? (
        <div className="border-b border-line px-2 py-1">
          <button
            type="button"
            className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-hover"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              run("formatBlock", "blockquote");
              setMore(false);
            }}
          >
            Citação
          </button>
        </div>
      ) : null}

      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Digite / para abrir o menu"
        onKeyDown={(event) => {
          plainPasteRef.current =
            (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "v";
        }}
        onKeyUp={() => {
          plainPasteRef.current = false;
        }}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={handlePaste}
        onInput={publish}
        className="rich-editor min-h-24 w-full px-3 py-3 text-sm leading-6 text-ink outline-none"
      />
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-ink"
    >
      {children}
    </button>
  );
}
