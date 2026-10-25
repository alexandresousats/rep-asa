import sanitizeHtml from "sanitize-html";

const MAX_DESCRIPTION = 20_000;

const background = [
  /^#[0-9a-f]{3,8}$/i,
  /^rgb\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}\s*\)$/i,
];

export function sanitizeRichText(value: string) {
  const trimmed = value.trim().slice(0, MAX_DESCRIPTION);
  if (!trimmed) return "";
  return sanitizeHtml(trimmed, {
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
    allowedAttributes: {
      a: ["href"],
      span: ["style"],
      mark: ["style"],
    },
    allowedStyles: {
      span: { "background-color": background },
      mark: { "background-color": background },
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
  }).slice(0, MAX_DESCRIPTION);
}
