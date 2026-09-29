import { createHash } from "node:crypto";
import { Parser } from "htmlparser2";
import postcss, { type ChildNode, type Declaration } from "postcss";
import sanitizeHtml from "sanitize-html";

export const MAX_HTML_BYTES = 1024 * 1024;
export const MAX_TRACKED_LINKS = 100;
export const SANITIZER_VERSION = "tagworks-html-v3-fidelity";

const allowedTags = [
  "a",
  "abbr",
  "address",
  "area",
  "article",
  "aside",
  "audio",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "hr",
  "html",
  "i",
  "img",
  "ins",
  "kbd",
  "label",
  "legend",
  "link",
  "li",
  "main",
  "map",
  "mark",
  "menu",
  "meta",
  "meter",
  "nav",
  "noscript",
  "ol",
  "p",
  "picture",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "search",
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
  "template",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "track",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
  // Static inline SVG is retained because generated landing pages commonly
  // use it for logos and icons. Active SVG elements such as script, animate,
  // set, and foreignObject are intentionally absent.
  "svg",
  "g",
  "defs",
  "desc",
  "image",
  "symbol",
  "use",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "clipPath",
  "mask",
  "pattern",
  "linearGradient",
  "radialGradient",
  "stop",
  "filter",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "marker",
  "view",
];

const allowedAttributes: Record<string, sanitizeHtml.AllowedAttribute[]> = {
  "*": [
    "class",
    "id",
    "style",
    "title",
    "role",
    "aria-*",
    "data-*",
    "dir",
    "lang",
    "hidden",
    "tabindex",
    "clip-path",
    "color",
    "dominant-baseline",
    "fill",
    "fill-opacity",
    "fill-rule",
    "filter",
    "mask",
    "marker-end",
    "marker-mid",
    "marker-start",
    "opacity",
    "paint-order",
    "stroke",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-opacity",
    "stroke-width",
    "text-anchor",
    "transform",
    "vector-effect",
    "visibility",
  ],
  a: ["href", "target", "rel", "download", "hreflang", "type", "referrerpolicy"],
  area: ["href", "alt", "coords", "shape", "target", "rel", "referrerpolicy"],
  audio: ["src", "controls", "autoplay", "loop", "muted", "preload", "crossorigin"],
  blockquote: ["cite"],
  button: ["type", "name", "value", "disabled"],
  col: ["span"],
  colgroup: ["span"],
  data: ["value"],
  details: ["open", "name"],
  dialog: ["open"],
  html: ["lang", "dir", "class", "id", "style", "data-*"],
  img: [
    "src",
    "srcset",
    "sizes",
    "alt",
    "width",
    "height",
    "loading",
    "decoding",
    "fetchpriority",
    "crossorigin",
    "referrerpolicy",
    "usemap",
  ],
  ins: ["cite", "datetime"],
  del: ["cite", "datetime"],
  li: ["value"],
  link: ["rel", "href", "media", "type", "crossorigin", "referrerpolicy", "integrity"],
  map: ["name"],
  meta: ["charset", "name", "content"],
  meter: ["value", "min", "max", "low", "high", "optimum"],
  ol: ["start", "reversed", "type"],
  progress: ["value", "max"],
  q: ["cite"],
  source: ["src", "srcset", "sizes", "type", "media", "width", "height"],
  style: ["media", "title"],
  td: ["colspan", "rowspan", "headers"],
  th: ["colspan", "rowspan", "scope", "headers", "abbr"],
  time: ["datetime"],
  track: ["default", "kind", "label", "src", "srclang"],
  video: [
    "src",
    "poster",
    "controls",
    "autoplay",
    "loop",
    "muted",
    "preload",
    "playsinline",
    "width",
    "height",
    "crossorigin",
  ],
  svg: [
    "viewBox",
    "width",
    "height",
    "fill",
    "stroke",
    "xmlns",
    "preserveAspectRatio",
    "focusable",
  ],
  g: ["fill", "stroke", "transform", "opacity", "clip-path", "mask", "filter"],
  defs: [],
  desc: [],
  image: [
    "href",
    "xlink:href",
    "x",
    "y",
    "width",
    "height",
    "preserveAspectRatio",
    "crossorigin",
  ],
  symbol: ["viewBox", "preserveAspectRatio"],
  use: ["href", "xlink:href", "x", "y", "width", "height", "fill", "stroke", "transform"],
  path: [
    "d",
    "pathLength",
    "fill",
    "fill-rule",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-opacity",
    "vector-effect",
    "transform",
    "opacity",
    "clip-path",
    "mask",
    "filter",
  ],
  rect: ["x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width", "transform", "opacity"],
  circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width", "transform", "opacity"],
  ellipse: ["cx", "cy", "rx", "ry", "fill", "stroke", "stroke-width", "transform", "opacity"],
  line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width", "transform", "opacity"],
  polyline: ["points", "fill", "stroke", "stroke-width", "transform", "opacity"],
  polygon: ["points", "fill", "stroke", "stroke-width", "transform", "opacity"],
  text: ["x", "y", "dx", "dy", "textLength", "lengthAdjust", "fill", "stroke", "font-size", "font-family", "font-weight", "text-anchor", "transform"],
  tspan: ["x", "y", "dx", "dy", "fill", "font-size", "font-family", "font-weight", "text-anchor"],
  clipPath: ["clipPathUnits", "transform"],
  mask: ["x", "y", "width", "height", "maskUnits", "maskContentUnits"],
  pattern: ["x", "y", "width", "height", "patternUnits", "patternContentUnits", "patternTransform", "viewBox", "preserveAspectRatio"],
  linearGradient: ["x1", "y1", "x2", "y2", "gradientUnits", "gradientTransform", "spreadMethod", "href", "xlink:href"],
  radialGradient: ["cx", "cy", "r", "fx", "fy", "fr", "gradientUnits", "gradientTransform", "spreadMethod", "href", "xlink:href"],
  stop: ["offset", "stop-color", "stop-opacity"],
  filter: ["x", "y", "width", "height", "filterUnits", "primitiveUnits", "color-interpolation-filters"],
  feBlend: ["in", "in2", "mode", "result"],
  feColorMatrix: ["in", "type", "values", "result"],
  feComponentTransfer: ["in", "result"],
  feComposite: ["in", "in2", "operator", "k1", "k2", "k3", "k4", "result"],
  feConvolveMatrix: ["in", "order", "kernelMatrix", "divisor", "bias", "targetX", "targetY", "edgeMode", "kernelUnitLength", "preserveAlpha", "result"],
  feDiffuseLighting: ["in", "surfaceScale", "diffuseConstant", "kernelUnitLength", "lighting-color", "result"],
  feDisplacementMap: ["in", "in2", "scale", "xChannelSelector", "yChannelSelector", "result"],
  feDistantLight: ["azimuth", "elevation"],
  feDropShadow: ["dx", "dy", "stdDeviation", "flood-color", "flood-opacity", "result"],
  feFlood: ["flood-color", "flood-opacity", "result"],
  feFuncA: ["type", "tableValues", "slope", "intercept", "amplitude", "exponent", "offset"],
  feFuncB: ["type", "tableValues", "slope", "intercept", "amplitude", "exponent", "offset"],
  feFuncG: ["type", "tableValues", "slope", "intercept", "amplitude", "exponent", "offset"],
  feFuncR: ["type", "tableValues", "slope", "intercept", "amplitude", "exponent", "offset"],
  feGaussianBlur: ["in", "stdDeviation", "edgeMode", "result"],
  feMerge: ["result"],
  feMergeNode: ["in"],
  feMorphology: ["in", "operator", "radius", "result"],
  feOffset: ["in", "dx", "dy", "result"],
  fePointLight: ["x", "y", "z"],
  feSpecularLighting: ["in", "surfaceScale", "specularConstant", "specularExponent", "kernelUnitLength", "lighting-color", "result"],
  feSpotLight: ["x", "y", "z", "pointsAtX", "pointsAtY", "pointsAtZ", "specularExponent", "limitingConeAngle"],
  feTile: ["in", "result"],
  feTurbulence: ["baseFrequency", "numOctaves", "seed", "stitchTiles", "type", "result"],
  marker: ["markerWidth", "markerHeight", "refX", "refY", "orient", "markerUnits", "viewBox", "preserveAspectRatio"],
  view: ["viewBox", "preserveAspectRatio", "zoomAndPan", "viewTarget"],
};

const canonicalTagNames = new Map(
  allowedTags.map((tagName) => [tagName.toLowerCase(), tagName]),
);
const allowedMetaNames = new Set([
  "color-scheme",
  "description",
  "theme-color",
  "viewport",
]);
const svgReferenceTags = new Set(["lineargradient", "radialgradient", "use"]);

function canonicalAttributesFor(tagName: string): Map<string, string> {
  const canonical = new Map<string, string>();
  const attributes = [
    ...(allowedAttributes["*"] ?? []),
    ...(allowedAttributes[canonicalTagNames.get(tagName.toLowerCase()) ?? tagName] ?? []),
  ];

  for (const attribute of attributes) {
    if (typeof attribute === "string" && !attribute.endsWith("-*")) {
      canonical.set(attribute.toLowerCase(), attribute);
    }
  }

  return canonical;
}

function normalizeAttributes(
  tagName: string,
  attributes: Record<string, string>,
): Record<string, string> {
  const canonical = canonicalAttributesFor(tagName);
  const normalized: Record<string, string> = {};

  for (const [sourceName, value] of Object.entries(attributes)) {
    const lowerName = sourceName.toLowerCase();
    if (
      lowerName.startsWith("on") ||
      lowerName === "nonce" ||
      lowerName === "srcdoc"
    ) {
      continue;
    }

    if (lowerName.startsWith("aria-") || lowerName.startsWith("data-")) {
      normalized[lowerName] = value;
      continue;
    }

    const canonicalName = canonical.get(lowerName);
    if (canonicalName) normalized[canonicalName] = value;
  }

  return normalized;
}

const forbiddenCssProperty = /^(?:behavior|-moz-binding)$/i;
const forbiddenCssValue =
  /(?:expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding|behavior\s*:|image\s*\(|element\s*\(|paint\s*\(|cross-fade\s*\(|\\)/i;

const safeAtRules = new Set([
  "container",
  "counter-style",
  "font-face",
  "font-feature-values",
  "keyframes",
  "layer",
  "media",
  "page",
  "property",
  "scope",
  "starting-style",
  "supports",
  "-webkit-keyframes",
]);
const localReferenceCssProperties = new Set([
  "clip-path",
  "filter",
  "marker",
  "marker-end",
  "marker-mid",
  "marker-start",
  "mask",
]);

function isSafeResourceUrl(input: string): boolean {
  const value = input.trim().replace(/^(['"])([\s\S]*)\1$/, "$2");
  if (!value || value.startsWith("#")) return true;
  if (
    /^(?:\/|\.\/|\.\.\/)/.test(value) &&
    !value.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(value) &&
    value.length <= 2048
  ) {
    return true;
  }
  if (/^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(value)) return true;
  if (/^data:(?:font|application\/(?:font-woff|font-woff2|vnd\.ms-fontobject));/i.test(value)) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.href.length <= 2048;
  } catch {
    return false;
  }
}

function hasOnlySafeCssUrls(value: string): boolean {
  const urlPattern = /url\(\s*(?:(['"])([\s\S]*?)\1|([^)]*?))\s*\)/gi;
  let match: RegExpExecArray | null;
  let matchedValue = value;

  while ((match = urlPattern.exec(value))) {
    if (!isSafeResourceUrl(match[2] ?? match[3] ?? "")) return false;
    matchedValue = matchedValue.replace(match[0], "");
  }

  return !/url\s*\(/i.test(matchedValue);
}

function isSafeImportParams(params: string): boolean {
  if (/\\|[{};]/.test(params)) return false;
  const match = params.match(
    /^\s*(?:url\(\s*(?:(['"])(.*?)\1|([^)]*?))\s*\)|(['"])(.*?)\4)(?:\s+[\s\S]*)?$/i,
  );
  return Boolean(match && isSafeResourceUrl(match[2] ?? match[3] ?? match[5] ?? ""));
}

function hasOnlyLocalFragmentUrls(value: string): boolean {
  const urlPattern = /url\(\s*(?:(['"])([\s\S]*?)\1|([^)]*?))\s*\)/gi;
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(value))) {
    if (!/^#[A-Za-z_][\w:.-]*$/.test((match[2] ?? match[3] ?? "").trim())) {
      return false;
    }
  }

  return true;
}

function cleanDeclaration(declaration: Declaration) {
  const property = declaration.prop.toLowerCase();
  const value = declaration.value;
  const localReferenceProperty = localReferenceCssProperties.has(property);

  if (
    forbiddenCssProperty.test(property) ||
    forbiddenCssValue.test(value) ||
    !hasOnlySafeCssUrls(value) ||
    (localReferenceProperty && !hasOnlyLocalFragmentUrls(value))
  ) {
    declaration.remove();
  }
}

function cleanCssRoot(css: string, inline = false) {
  try {
    const source = inline ? `tagworks-inline{${css}}` : css;
    const root = postcss.parse(source, { from: undefined });

    root.walkAtRules((rule) => {
      const name = rule.name.toLowerCase();
      if (name === "import") {
        if (!isSafeImportParams(rule.params)) rule.remove();
        return;
      }
      if (!safeAtRules.has(name)) rule.remove();
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

function formatUuid(bytes: Uint8Array): string {
  const hex = Buffer.from(bytes).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function deterministicLinkId(
  versionId: string,
  ordinal: number,
  destinationUrl: string,
): string {
  const digest = createHash("sha256")
    .update(versionId)
    .update("\0")
    .update(String(ordinal))
    .update("\0")
    .update(destinationUrl)
    .digest()
    .subarray(0, 16);

  // RFC 9562 version 8 is reserved for application-defined UUID layouts.
  digest[6] = (digest[6] & 0x0f) | 0x80;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  return formatUuid(digest);
}

function normalizeAbsoluteHttpsUrl(rawHref: string): URL | null {
  const href = rawHref.trim();
  if (!/^https:/i.test(href)) return null;

  try {
    const parsed = new URL(href);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.href.length > 2048 ||
      parsed.hostname.length > 253
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isSafeHtmlResource(value: string, allowContact = false): boolean {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.startsWith("#") ||
    (normalized.startsWith("/") && !normalized.startsWith("//")) ||
    normalized.startsWith("./") ||
    normalized.startsWith("../")
  ) {
    return true;
  }
  if (allowContact && /^(?:mailto|tel):/i.test(normalized)) return true;
  return isSafeResourceUrl(normalized);
}

function isSafeStylesheetResource(value: string): boolean {
  const normalized = value.trim();
  if (
    /^(?:\/|\.\/|\.\.\/)/.test(normalized) &&
    !normalized.startsWith("//") &&
    !/[\\\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return normalized.length <= 2048;
  }
  return normalizeAbsoluteHttpsUrl(normalized) !== null;
}

function hasSafeSrcset(value: string): boolean {
  return (
    !/(?:javascript|vbscript|data:(?!image\/(?:png|jpeg|gif|webp|avif);base64,)|http:|(?:^|[,\s])\/\/)/i.test(
      value,
    ) && value.length <= 16_384
  );
}

function isLocalSvgReference(value: string): boolean {
  return /^#[A-Za-z_][\w:.-]*$/.test(value.trim());
}

function hasSafeSvgPaint(value: string): boolean {
  return !/url\s*\(/i.test(value) || hasOnlyLocalFragmentUrls(value);
}

export type PublishedOutboundLink = {
  destinationHost: string;
  destinationUrl: string;
  id: string;
  label: string;
  ordinal: number;
};

function createTagRewriter(
  versionId: string | undefined,
  outboundLinks: PublishedOutboundLink[],
  onTrackingLimit: () => void,
) {
  let externalLinkCount = 0;

  return function rewriteTag(
    tagName: string,
    attribs: Record<string, string>,
  ): sanitizeHtml.Tag {
    const normalizedTag = tagName.toLowerCase();
    const canonicalTag = canonicalTagNames.get(normalizedTag) ?? normalizedTag;
    const next = normalizeAttributes(canonicalTag, attribs);

    if (normalizedTag === "meta") {
      if (/^utf-?8$/i.test(next.charset ?? "")) {
        return { tagName: canonicalTag, attribs: { charset: "utf-8" } };
      }

      const name = (next.name ?? "").trim().toLowerCase();
      if (allowedMetaNames.has(name) && typeof next.content === "string") {
        return {
          tagName: canonicalTag,
          attribs: { name, content: next.content },
        };
      }

      return { tagName: canonicalTag, attribs: {} };
    }

    if (normalizedTag === "link") {
      const rel = new Set((next.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean));
      if (!rel.has("stylesheet") || !next.href || !isSafeStylesheetResource(next.href)) {
        return { tagName: canonicalTag, attribs: {} };
      }
      next.rel = "stylesheet";
      next.referrerpolicy = "no-referrer";
    }

    if (next.style) {
      next.style = cleanCssRoot(next.style, true);
      if (!next.style) delete next.style;
    }

    if (normalizedTag === "a") {
      const destination = next.href ? normalizeAbsoluteHttpsUrl(next.href) : null;
      if (destination) {
        if (externalLinkCount < MAX_TRACKED_LINKS && versionId) {
          const ordinal = externalLinkCount;
          outboundLinks.push({
            destinationHost: destination.hostname.toLowerCase(),
            destinationUrl: destination.href,
            id: deterministicLinkId(versionId, ordinal, destination.href),
            label: destination.hostname.toLowerCase(),
            ordinal,
          });
        } else if (externalLinkCount >= MAX_TRACKED_LINKS) {
          onTrackingLimit();
        }
        externalLinkCount += 1;
      }

      if (next.href && !isSafeHtmlResource(next.href, true)) delete next.href;
      if (next.target?.toLowerCase() === "_blank") {
        const rel = new Set((next.rel ?? "").split(/\s+/).filter(Boolean));
        rel.add("noopener");
        rel.add("noreferrer");
        next.rel = [...rel].join(" ");
      } else if (next.target && !["_self", "_parent"].includes(next.target.toLowerCase())) {
        delete next.target;
      }
    }

    if (normalizedTag === "area") {
      if (next.href && !isSafeHtmlResource(next.href, true)) delete next.href;
      if (next.target?.toLowerCase() === "_blank") {
        const rel = new Set((next.rel ?? "").split(/\s+/).filter(Boolean));
        rel.add("noopener");
        rel.add("noreferrer");
        next.rel = [...rel].join(" ");
      } else if (next.target && !["_self", "_parent"].includes(next.target.toLowerCase())) {
        delete next.target;
      }
    }

    if (["img", "source", "video", "audio", "track"].includes(normalizedTag)) {
      if (next.src && !isSafeHtmlResource(next.src)) delete next.src;
      if (next.srcset && !hasSafeSrcset(next.srcset)) delete next.srcset;
      if (normalizedTag === "img") next.referrerpolicy = "no-referrer";
    }

    if (normalizedTag === "image") {
      if (next.href && !isSafeHtmlResource(next.href)) delete next.href;
      if (next["xlink:href"] && !isSafeHtmlResource(next["xlink:href"])) {
        delete next["xlink:href"];
      }
    }

    if (normalizedTag === "video" && next.poster && !isSafeHtmlResource(next.poster)) {
      delete next.poster;
    }

    if (svgReferenceTags.has(normalizedTag)) {
      if (next.href && !isLocalSvgReference(next.href)) delete next.href;
      if (next["xlink:href"] && !isLocalSvgReference(next["xlink:href"])) {
        delete next["xlink:href"];
      }
    }

    for (const attribute of [
      "clip-path",
      "fill",
      "filter",
      "marker-end",
      "marker-mid",
      "marker-start",
      "mask",
      "stroke",
    ]) {
      if (next[attribute] && !hasSafeSvgPaint(next[attribute])) delete next[attribute];
    }

    return { tagName: canonicalTag, attribs: next };
  };
}

type DocumentMarkers = {
  bodyCloseStart: number | null;
  bodyOpenEnd: number | null;
  hasCharset: boolean;
  hasHeadTitle: boolean;
  hasHtmlElement: boolean;
  hasViewport: boolean;
  headCloseEnd: number | null;
  headCloseStart: number | null;
  headOpenEnd: number | null;
  htmlCloseStart: number | null;
  htmlOpenEnd: number | null;
};

function inspectDocument(html: string): DocumentMarkers {
  const markers: DocumentMarkers = {
    bodyCloseStart: null,
    bodyOpenEnd: null,
    hasCharset: false,
    hasHeadTitle: false,
    hasHtmlElement: false,
    hasViewport: false,
    headCloseEnd: null,
    headCloseStart: null,
    headOpenEnd: null,
    htmlCloseStart: null,
    htmlOpenEnd: null,
  };
  let explicitHeadDepth = 0;
  let parser: Parser;

  parser = new Parser(
    {
      onclosetag(name, isImplied) {
        const normalizedName = name.toLowerCase();
        if (!isImplied) {
          if (normalizedName === "body") markers.bodyCloseStart = parser.startIndex;
          if (normalizedName === "head") {
            markers.headCloseStart = parser.startIndex;
            markers.headCloseEnd = parser.endIndex + 1;
          }
          if (normalizedName === "html") markers.htmlCloseStart = parser.startIndex;
        }
        if (normalizedName === "head" && explicitHeadDepth > 0) explicitHeadDepth -= 1;
      },
      onopentag(name, attributes) {
        const normalizedName = name.toLowerCase();
        if (normalizedName === "html") {
          markers.hasHtmlElement = true;
          markers.htmlOpenEnd ??= parser.endIndex + 1;
        }
        if (normalizedName === "head") {
          explicitHeadDepth += 1;
          markers.headOpenEnd ??= parser.endIndex + 1;
        }
        if (normalizedName === "body") markers.bodyOpenEnd ??= parser.endIndex + 1;
        if (explicitHeadDepth > 0 && normalizedName === "title") {
          markers.hasHeadTitle = true;
        }
        if (explicitHeadDepth > 0 && normalizedName === "meta") {
          if (/^utf-?8$/i.test(attributes.charset ?? "")) markers.hasCharset = true;
          if ((attributes.name ?? "").toLowerCase() === "viewport") {
            markers.hasViewport = true;
          }
        }
      },
    },
    { decodeEntities: false },
  );
  parser.end(html);

  return markers;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

function insertAt(source: string, index: number, addition: string): string {
  return `${source.slice(0, index)}${addition}${source.slice(index)}`;
}

function requiredHeadMarkup(markers: DocumentMarkers, fallbackTitle: string): string {
  return [
    markers.hasCharset ? "" : '<meta charset="utf-8">',
    markers.hasViewport
      ? ""
      : '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    markers.hasHeadTitle ? "" : `<title>${escapeHtml(fallbackTitle)}</title>`,
  ].join("");
}

function canonicalizeDocument(cleaned: string, fallbackTitle?: string): string {
  let document = cleaned.trim();
  if (!document) return "";

  const safeFallbackTitle = fallbackTitle?.trim() || "제목 없는 페이지";
  let markers = inspectDocument(document);
  if (!markers.hasHtmlElement) {
    return `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(safeFallbackTitle)}</title></head><body>${document}</body></html>`;
  }

  document = document.replace(/^\s*<!doctype[^>]*>\s*/i, "");
  markers = inspectDocument(document);
  if (markers.headOpenEnd === null) {
    document = insertAt(
      document,
      markers.htmlOpenEnd ?? 0,
      `<head>${requiredHeadMarkup(markers, safeFallbackTitle)}</head>`,
    );
  } else {
    document = insertAt(
      document,
      markers.headOpenEnd,
      requiredHeadMarkup(markers, safeFallbackTitle),
    );
  }

  markers = inspectDocument(document);
  if (markers.bodyOpenEnd === null) {
    const contentStart = markers.headCloseEnd ?? markers.headOpenEnd ?? markers.htmlOpenEnd ?? 0;
    const contentEnd = markers.htmlCloseStart ?? document.length;
    const bodyContent = document.slice(contentStart, contentEnd);
    document = `${document.slice(0, contentStart)}<body>${bodyContent}</body>${document.slice(contentEnd)}`;
  }

  return `<!doctype html>\n${document}`;
}

export type SanitizedPage = {
  html: string;
  outboundLinks: PublishedOutboundLink[];
  warnings: string[];
};

export function sanitizePublishedHtml(
  source: string,
  options: { fallbackTitle?: string; versionId?: string } = {},
): SanitizedPage {
  const warnings: string[] = [];
  const outboundLinks: PublishedOutboundLink[] = [];
  let trackingLimitWarning = false;
  const checks: Array<[RegExp, string]> = [
    [/<\s*script\b/i, "스크립트가 제거되었습니다."],
    [/\son[a-z]+\s*=/i, "이벤트 핸들러가 제거되었습니다."],
    [/<\s*(?:iframe|object|embed|base)\b/i, "실행 또는 임베드 요소가 제거되었습니다."],
    [/<\s*(?:form|input|select|textarea|option|datalist|output)\b/i, "입력 또는 전송 요소가 제거되었습니다."],
    [/<\s*meta\b[^>]*http-equiv\s*=\s*["']?refresh/i, "자동 이동 설정이 제거되었습니다."],
    [/(?:javascript\s*:|vbscript\s*:|expression\s*\()/i, "실행 가능한 URL 또는 스타일이 제거되었습니다."],
    [
      /(?:<(?:img|link|source|video|audio|track)\b[^>]*(?:src|href)\s*=\s*["']?https:|(?:url\s*\(|@import\s+)(?:["']|url\(["']?)?https:)/i,
      "외부 이미지·폰트·스타일은 방문 시 해당 제공자에게 직접 요청됩니다.",
    ],
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
    allowedAttributes,
    allowedSchemes: ["https", "mailto", "tel", "data"],
    allowedSchemesByTag: {
      audio: ["https", "data"],
      a: ["https", "mailto", "tel"],
      image: ["https", "data"],
      img: ["https", "data"],
      link: ["https"],
      source: ["https", "data"],
      track: ["https", "data"],
      use: [],
      video: ["https", "data"],
    },
    allowedSchemesAppliedToAttributes: ["href", "src", "cite", "poster", "xlink:href"],
    allowProtocolRelative: false,
    enforceHtmlBoundary: false,
    nonTextTags: ["style", "script", "iframe", "object", "embed", "xmp"],
    parseStyleAttributes: false,
    parser: {
      lowerCaseAttributeNames: false,
      lowerCaseTags: false,
    },
    transformTags: {
      "*": createTagRewriter(options.versionId, outboundLinks, () => {
        trackingLimitWarning = true;
      }),
    },
    exclusiveFilter(frame) {
      return (
        (frame.tag === "link" || frame.tag === "meta") &&
        Object.keys(frame.attribs).length === 0
      );
    },
  });

  cleaned = cleaned.replace(/(<style\b[^>]*>)([\s\S]*?)<\/style>/gi, (_match, opening: string, css: string) => {
    const safeCss = cleanCssRoot(css);
    return safeCss ? `${opening}${safeCss}</style>` : "";
  });

  const publishedHtml = canonicalizeDocument(cleaned, options.fallbackTitle);

  if (trackingLimitWarning) {
    warnings.push(`외부 링크 분석은 문서에서 처음 ${MAX_TRACKED_LINKS}개까지 적용됩니다.`);
  }

  return {
    html: publishedHtml,
    outboundLinks,
    warnings: [...new Set(warnings)],
  };
}
