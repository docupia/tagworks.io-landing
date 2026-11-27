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

/**
 * Small "Made with TagWorks" badge for Free pages. It sits in the bottom-right
 * corner, away from page navigation, stays legible on light and dark pages,
 * respects the safe area on phones and is hidden when printing.
 */
export function renderTagworksCornerLink(): string {
  const font = 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  return [
    '<style data-tagworks-platform="corner-link-style">',
    '@media print{[data-tagworks-platform="corner-link"]{display:none!important}}',
    '[data-tagworks-platform="corner-link"]:hover{transform:translateY(-1px)!important;box-shadow:0 6px 18px rgba(32,38,26,.22)!important}',
    '[data-tagworks-platform="corner-link"]:focus-visible{outline:2px solid #596248!important;outline-offset:2px!important}',
    '</style>',
    '<a data-tagworks-platform="corner-link" href="https://tagworks.io/" target="_blank" rel="noopener noreferrer" aria-label="Made with TagWorks" title="Made with TagWorks" style="',
    'position:fixed!important;right:max(12px,env(safe-area-inset-right))!important;bottom:max(12px,env(safe-area-inset-bottom))!important;',
    'top:auto!important;left:auto!important;width:auto!important;height:28px!important;margin:0!important;padding:0 10px 0 4px!important;',
    'display:inline-flex!important;align-items:center!important;gap:6px!important;box-sizing:border-box!important;',
    'border:1px solid rgba(89,98,72,.22)!important;border-radius:999px!important;background:rgba(255,253,247,.94)!important;',
    'color:#3d4430!important;text-decoration:none!important;box-shadow:0 3px 12px rgba(32,38,26,.16)!important;',
    `font:600 12px/1 ${font}!important;letter-spacing:0!important;white-space:nowrap!important;`,
    '-webkit-backdrop-filter:blur(8px)!important;backdrop-filter:blur(8px)!important;transition:transform .15s,box-shadow .15s!important;',
    'z-index:2147483647!important;isolation:isolate!important">',
    `<span aria-hidden="true" style="display:inline-grid!important;place-items:center!important;width:20px!important;height:20px!important;border-radius:999px!important;background:#596248!important;color:#fffdf7!important;font:900 11px/1 ${font}!important">T</span>`,
    '<span aria-hidden="true" style="color:inherit!important;font:inherit!important"><span style="color:#74805f!important;font-weight:500!important">Made with</span> TagWorks</span>',
    '</a>',
  ].join("");
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
