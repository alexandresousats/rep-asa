import sanitizeHtml from "sanitize-html";
import { HIGHLIGHT_BACKGROUND } from "../../src/lib/paste-html";

const MAX_DESCRIPTION = 20_000;

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
      span: { "background-color": HIGHLIGHT_BACKGROUND },
      mark: { "background-color": HIGHLIGHT_BACKGROUND },
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
  }).slice(0, MAX_DESCRIPTION);
}
