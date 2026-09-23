import postcss, { type ChildNode, type Declaration } from "postcss";
import safeParser from "postcss-safe-parser";
import sanitizeHtml from "sanitize-html";

export const MAX_HTML_BYTES = 1024 * 1024;
export const SANITIZER_VERSION = "tagworks-html-v1";

const allowedTags = [
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "b",
  "blockquote",
  "br",
  "button",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "main",
  "mark",
  "nav",
  "ol",
  "p",
  "picture",
  "pre",
  "q",
  "s",
  "samp",
  "section",
  "small",
  "source",
  "span",
  "strong",
  "style",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
];

const safeCssProperties = new Set([
  "align-content",
  "align-items",
  "align-self",
  "aspect-ratio",
  "background",
  "background-color",
  "border",
  "border-block",
  "border-bottom",
  "border-color",
  "border-inline",
  "border-left",
  "border-radius",
  "border-right",
  "border-style",
  "border-top",
  "border-width",
  "box-shadow",
  "box-sizing",
  "color",
  "column-count",
  "column-gap",
  "display",
  "flex",
  "flex-basis",
  "flex-direction",
  "flex-flow",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "font",
  "font-family",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "gap",
  "grid",
  "grid-area",
  "grid-auto-columns",
  "grid-auto-flow",
  "grid-auto-rows",
  "grid-column",
  "grid-row",
  "grid-template",
  "grid-template-areas",
  "grid-template-columns",
  "grid-template-rows",
  "height",
  "hyphens",
  "justify-content",
  "justify-items",
  "justify-self",
  "letter-spacing",
  "line-height",
  "list-style",
  "list-style-position",
  "list-style-type",
  "margin",
  "margin-block",
  "margin-bottom",
  "margin-inline",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "object-fit",
  "object-position",
  "opacity",
  "order",
  "overflow",
  "overflow-wrap",
  "overflow-x",
  "overflow-y",
  "padding",
  "padding-block",
  "padding-bottom",
  "padding-inline",
  "padding-left",
  "padding-right",
  "padding-top",
  "place-content",
  "place-items",
  "text-align",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-indent",
  "text-overflow",
  "text-shadow",
  "text-transform",
  "transform",
  "transform-origin",
  "vertical-align",
  "white-space",
  "width",
  "word-break",
  "word-spacing",
]);

const forbiddenCssValue =
  /(?:url\s*\(|expression\s*\(|@import|-moz-binding|behavior\s*:|javascript\s*:|data\s*:|https?\s*:|\/\/|image(?:-set)?\s*\(|element\s*\(|paint\s*\(|cross-fade\s*\(|-webkit-|\\)/i;

function cleanDeclaration(declaration: Declaration) {
  const property = declaration.prop.toLowerCase();
  const value = declaration.value;

  if (
    (!safeCssProperties.has(property) && !property.startsWith("--tw-user-")) ||
    forbiddenCssValue.test(value) ||
    /!\s*important/i.test(value)
  ) {
    declaration.remove();
  }
}

function cleanCssRoot(css: string, inline = false) {
  try {
    const source = inline ? `tagworks-inline{${css}}` : css;
    const root = postcss().process(source, { parser: safeParser, from: undefined }).root;

    root.walkAtRules((rule) => {
      rule.remove();
    });
    root.walkDecls(cleanDeclaration);
    root.walkComments((comment) => {
      comment.remove();
    });

    if (inline) {
      const first = root.first;
      if (!first || first.type !== "rule") return "";
      return first.nodes.map((node: ChildNode) => node.toString()).join(";");
    }

    return root.toString();
  } catch {
    return "";
  }
}

function rewriteTag(
  tagName: string,
  attribs: Record<string, string>,
): sanitizeHtml.Tag {
  if (tagName === "style") {
    return { tagName, attribs: {} };
  }

  const next = { ...attribs };

  if (next.style) {
    next.style = cleanCssRoot(next.style, true);
    if (!next.style) delete next.style;
  }

  if (tagName === "a") {
    next.target = "_blank";
    next.rel = "noopener noreferrer nofollow";
  }

  if ((tagName === "img" || tagName === "source") && next.src) {
    if (!/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(next.src)) delete next.src;
  }

  return { tagName, attribs: next };
}

export type SanitizedPage = {
  html: string;
  warnings: string[];
};

export function sanitizePublishedHtml(source: string): SanitizedPage {
  const warnings: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/<\s*script\b/i, "스크립트가 제거되었습니다."],
    [/\son[a-z]+\s*=/i, "이벤트 핸들러가 제거되었습니다."],
    [/<\s*(?:iframe|object|embed|form|input|textarea|select)\b/i, "입력 또는 임베드 요소가 제거되었습니다."],
    [/<\s*(?:svg|math)\b/i, "SVG 또는 MathML 요소가 제거되었습니다."],
    [/(?:javascript\s*:|@import|url\s*\()/i, "외부 실행 또는 네트워크 스타일이 제거되었습니다."],
  ];

  for (const [pattern, warning] of checks) {
    if (pattern.test(source)) warnings.push(warning);
  }

  let cleaned = sanitizeHtml(source, {
    allowedTags,
    // Style blocks are parsed and allowlisted immediately below; scripts and
    // executable HTML are still discarded by sanitize-html and the CSP.
    allowVulnerableTags: true,
    disallowedTagsMode: "discard",
    allowedAttributes: {
      "*": ["class", "id", "style", "title", "role", "aria-*"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading"],
      source: ["src", "type", "media"],
      time: ["datetime"],
      td: ["colspan", "rowspan", "headers"],
      th: ["colspan", "rowspan", "scope", "headers"],
      col: ["span"],
      colgroup: ["span"],
      ol: ["start", "reversed", "type"],
      li: ["value"],
      q: ["cite"],
      blockquote: ["cite"],
    },
    allowedSchemes: ["https", "mailto", "tel"],
    allowedSchemesByTag: {
      img: ["data"],
      source: ["data"],
      a: ["https", "mailto", "tel"],
    },
    allowProtocolRelative: false,
    parseStyleAttributes: false,
    transformTags: {
      "*": rewriteTag,
    },
    exclusiveFilter(frame) {
      if ((frame.tag === "img" || frame.tag === "source") && !frame.attribs.src) {
        return true;
      }
      return false;
    },
  });

  cleaned = cleaned.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_match, css: string) => {
    const safeCss = cleanCssRoot(css);
    return safeCss ? `<style>${safeCss}</style>` : "";
  });

  return { html: cleaned.trim(), warnings: [...new Set(warnings)] };
}
