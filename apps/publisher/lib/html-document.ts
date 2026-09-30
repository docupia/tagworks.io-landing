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

type DocumentMarkers = {
  bodyCloseStart: number | null;
  doctypeEnd: number | null;
  hasHtmlElement: boolean;
  hasHeadTitleElement: boolean;
  headCloseStart: number | null;
  headOpenEnd: number | null;
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

function ensureFallbackTitle(
  document: string,
  markers: DocumentMarkers,
  fallbackTitle: string,
): string {
  if (markers.hasHeadTitleElement) return document;

  const title = `<title>${escapeHtml(fallbackTitle)}</title>`;
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

  const withTitle = ensureFallbackTitle(sanitizedHtml, markers, fallbackTitle);
  return injectTracker(withTitle, trackerScript);
}
