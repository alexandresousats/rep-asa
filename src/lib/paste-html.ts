import sanitizeHtml from "sanitize-html";

export const RICH_TEXT_MARK = "<!--openasa-->";
export const RICH_TEXT_MIME = "application/x-openasa-rich";
export const HIGHLIGHT_COLOR = "#fde68a";

export const HIGHLIGHT_BACKGROUND = [
  /^#fde68a$/i,
  /^rgb\(\s*253\s*,\s*230\s*,\s*138\s*\)$/i,
];

const BLOCKS = [
  "address",
  "article",
  "blockquote",
  "center",
  "div",
  "figcaption",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "section",
  "tr",
];

function paragraph(): sanitizeHtml.Tag {
  return { tagName: "p", attribs: {} };
}

export function highlightStyle(value: string) {
  const match = value.match(/(?:^|;)\s*background-color\s*:\s*([^;]+)/i);
  const color = match?.[1]?.trim() ?? "";
  if (!HIGHLIGHT_BACKGROUND.some((pattern) => pattern.test(color))) return "";
  return `background-color: ${HIGHLIGHT_COLOR}`;
}

export function plainTextToEditorHtml(value: string) {
  if (!value) return "";
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function stripExternalPasteHtml(value: string) {
  const source = value.trim();
  if (!source) return "";

  const transformTags: NonNullable<sanitizeHtml.IOptions["transformTags"]> = {
    font: () => ({ tagName: "span", attribs: {} }),
    span: (_tag, attribs) => {
      const block = /display\s*:\s*block/i.test(attribs.style ?? "");
      return block ? paragraph() : { tagName: "span", attribs: {} };
    },
  };
  for (const tag of BLOCKS) transformTags[tag] = paragraph;

  return sanitizeHtml(source, {
    allowedTags: [
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
      "ul",
      "ol",
      "li",
    ],
    allowedAttributes: {
      a: ["href"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
    transformTags,
  }).trim();
}
