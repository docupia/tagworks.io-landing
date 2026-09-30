import { Parser } from "htmlparser2";

export const ISOLATED_ORIGINAL_SANITIZER_VERSION =
  "tagworks-html-v4-isolated-original";

const FULL_DOCUMENT_SANITIZER_VERSIONS = new Set([
  "tagworks-html-v3-fidelity",
  ISOLATED_ORIGINAL_SANITIZER_VERSION,
]);

export function isIsolatedOriginalVersion(version: string | null | undefined) {
  return version === ISOLATED_ORIGINAL_SANITIZER_VERSION;
}

export function isIsolatedOriginalDocument(
  version: string | null | undefined,
  html: string,
) {
  if (isIsolatedOriginalVersion(version)) return true;

  // Compatibility for deployments where the public RPC has not yet exposed
  // sanitizer_version. Legacy v3 artifacts never retain executable markup, so
  // this narrow fallback only selects documents that require script isolation.
  return (
    !version &&
    (/<\s*script\b/i.test(html) || /\son[a-z]+\s*=\s*(?:["']|[^\s>])/i.test(html))
  );
}

type DocumentMarkers = {
  bodyCloseStart: number | null;
  doctypeEnd: number | null;
  hasHtmlElement: boolean;
  hasHeadTitleElement: boolean;
  headCloseStart: number | null;
  headOpenEnd: number | null;
  headTitleCloseStart: number | null;
  headTitleOpenEnd: number | null;
  htmlCloseStart: number | null;
  htmlOpenEnd: number | null;
};

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

function inspectDocument(html: string): DocumentMarkers {
  const markers: DocumentMarkers = {
    bodyCloseStart: null,
    doctypeEnd: null,
    hasHtmlElement: false,
    hasHeadTitleElement: false,
    headCloseStart: null,
    headOpenEnd: null,
    headTitleCloseStart: null,
    headTitleOpenEnd: null,
    htmlCloseStart: null,
    htmlOpenEnd: null,
  };

  let headDepth = 0;
  let parser: Parser;
  let svgDepth = 0;
  parser = new Parser(
    {
      onclosetag(name, isImplied) {
        if (!isImplied) {
          if (name === "body") markers.bodyCloseStart = parser.startIndex;
          if (name === "head") markers.headCloseStart = parser.startIndex;
          if (name === "html") markers.htmlCloseStart = parser.startIndex;
          if (
            name === "title" &&
            markers.headTitleOpenEnd !== null &&
            markers.headTitleCloseStart === null
          ) {
            markers.headTitleCloseStart = parser.startIndex;
          }
        }

        if (name === "head") headDepth = Math.max(0, headDepth - 1);
        if (name === "svg") svgDepth = Math.max(0, svgDepth - 1);
      },
      onopentag(name) {
        if (name === "html") {
          markers.hasHtmlElement = true;
          markers.htmlOpenEnd ??= parser.endIndex + 1;
        }
        if (name === "head") {
          markers.headOpenEnd ??= parser.endIndex + 1;
          headDepth += 1;
        }
        if (name === "svg") svgDepth += 1;
        if (name === "title" && headDepth > 0 && svgDepth === 0) {
          markers.hasHeadTitleElement = true;
          markers.headTitleOpenEnd ??= parser.endIndex + 1;
        }
      },
      onprocessinginstruction(name, data) {
        if (name === "!doctype" && /^!doctype\s+html(?:\s|$)/i.test(data)) {
          markers.doctypeEnd ??= parser.endIndex + 1;
        }
      },
    },
    { decodeEntities: false },
  );
  parser.end(html);

  return markers;
}

function insertAt(source: string, index: number, addition: string): string {
  return `${source.slice(0, index)}${addition}${source.slice(index)}`;
}

function ensureManagedTitle(
  document: string,
  markers: DocumentMarkers,
  managedTitle: string,
): string {
  const escapedTitle = escapeHtml(managedTitle);
  if (
    markers.hasHeadTitleElement &&
    markers.headTitleOpenEnd !== null &&
    markers.headTitleCloseStart !== null
  ) {
    return `${document.slice(0, markers.headTitleOpenEnd)}${escapedTitle}${document.slice(markers.headTitleCloseStart)}`;
  }

  const title = `<title>${escapedTitle}</title>`;
  if (markers.headCloseStart !== null) {
    return insertAt(document, markers.headCloseStart, title);
  }
  if (markers.headOpenEnd !== null) {
    return insertAt(document, markers.headOpenEnd, title);
  }

  const head = `<head>${title}</head>`;
  if (markers.htmlOpenEnd !== null) {
    return insertAt(document, markers.htmlOpenEnd, head);
  }
  if (markers.doctypeEnd !== null) {
    return insertAt(document, markers.doctypeEnd, head);
  }
  return `${head}${document}`;
}

export function renderTagworksCornerLink(): string {
  return '<a data-tagworks-platform="corner-link" href="https://tagworks.io/" target="_blank" rel="noopener noreferrer" aria-label="Tagworks.io로 이동" title="Tagworks.io" style="position:fixed!important;top:0!important;right:0!important;width:76px!important;height:76px!important;margin:0!important;padding:0!important;display:block!important;overflow:hidden!important;clip-path:polygon(0 0,100% 0,100% 100%)!important;background:#596248!important;color:#fffdf7!important;text-decoration:none!important;filter:drop-shadow(-4px 5px 8px rgba(32,38,26,.22))!important;z-index:2147483647!important;isolation:isolate!important"><span aria-hidden="true" style="position:absolute!important;top:10px!important;right:11px!important;color:#fffdf7!important;font:900 18px/1 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif!important;letter-spacing:-.05em!important">T</span></a>';
}

function injectTracker(document: string, trackerScript: string): string {
  if (!trackerScript) return document;
  const markers = inspectDocument(document);
  const insertionPoint =
    markers.bodyCloseStart ?? markers.htmlCloseStart ?? document.length;
  return insertAt(document, insertionPoint, trackerScript);
}

function renderLegacyFragment(
  fragment: string,
  fallbackTitle: string,
  description: string | null,
  trackerScript: string,
): string {
  const descriptionMeta = description
    ? `<meta name="description" content="${escapeHtml(description)}">`
    : "";

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
  ${descriptionMeta}
  <title>${escapeHtml(fallbackTitle)}</title>
</head>
<body>
${fragment}
${trackerScript}
</body>
</html>`;
}

export type RenderPublishedDocumentOptions = {
  description: string | null;
  fallbackTitle: string;
  sanitizerVersion?: string | null;
  sanitizedHtml: string;
  trackerScript?: string;
};

export function renderPublishedDocument({
  description,
  fallbackTitle,
  sanitizerVersion,
  sanitizedHtml,
  trackerScript = "",
}: RenderPublishedDocumentOptions): string {
  const markers = inspectDocument(sanitizedHtml);
  const isVersionedFullDocument = Boolean(
    sanitizerVersion && FULL_DOCUMENT_SANITIZER_VERSIONS.has(sanitizerVersion),
  );
  const isParsedFullDocument = markers.hasHtmlElement || markers.doctypeEnd !== null;

  if (!isVersionedFullDocument && !isParsedFullDocument) {
    return renderLegacyFragment(
      sanitizedHtml,
      fallbackTitle,
      description,
      trackerScript,
    );
  }

  const withTitle = ensureManagedTitle(sanitizedHtml, markers, fallbackTitle);
  return injectTracker(withTitle, trackerScript);
}
