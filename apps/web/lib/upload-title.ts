const MAX_UPLOAD_TITLE_LENGTH = 100;

function normalizeTitle(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_UPLOAD_TITLE_LENGTH);
}

function decodeBasicHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined, named: string | undefined) => {
      if (decimal) {
        const codePoint = Number.parseInt(decimal, 10);
        return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      if (hexadecimal) {
        const codePoint = Number.parseInt(hexadecimal, 16);
        return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      return named ? (namedEntities[named.toLowerCase()] ?? entity) : entity;
    },
  );
}

function extractWithBrowserParser(source: string) {
  if (typeof DOMParser === "undefined") return null;

  const document = new DOMParser().parseFromString(source, "text/html");
  const titleElement = Array.from(document.head?.children ?? []).find(
    (element) => element.tagName.toLowerCase() === "title",
  );

  return titleElement ? normalizeTitle(titleElement.textContent ?? "") || null : null;
}

function extractWithoutDom(source: string) {
  const headMatch = /<head(?:\s[^>]*)?>/i.exec(source);
  if (!headMatch) return null;

  const headStart = headMatch.index + headMatch[0].length;
  const headEndMatch = /<\/head\s*>/i.exec(source.slice(headStart));
  if (!headEndMatch) return null;

  const head = source.slice(headStart, headStart + headEndMatch.index);
  const voidElements = new Set(["base", "basefont", "bgsound", "link", "meta"]);
  const openElements: string[] = [];
  const tokenPattern = /<!--[\s\S]*?-->|<\/?([a-z][\w:-]*)(?:\s[^>]*)?>/gi;

  for (let token = tokenPattern.exec(head); token; token = tokenPattern.exec(head)) {
    if (token[0].startsWith("<!--")) continue;

    const elementName = token[1]?.toLowerCase();
    if (!elementName) continue;

    if (token[0].startsWith("</")) {
      const elementIndex = openElements.lastIndexOf(elementName);
      if (elementIndex >= 0) openElements.splice(elementIndex);
      continue;
    }

    if (elementName === "title" && openElements.length === 0) {
      const titleEnd = /<\/title\s*>/i.exec(head.slice(tokenPattern.lastIndex));
      if (!titleEnd) return null;
      const rawTitle = head.slice(
        tokenPattern.lastIndex,
        tokenPattern.lastIndex + titleEnd.index,
      );
      return normalizeTitle(decodeBasicHtmlEntities(rawTitle)) || null;
    }

    if (!voidElements.has(elementName) && !token[0].endsWith("/>")) {
      openElements.push(elementName);
    }
  }

  return null;
}

/**
 * Reads only a document-level `<head><title>`. Titles used by SVG or content in
 * `<body>` are deliberately ignored so artwork labels never become page names.
 */
export function extractHeadTitle(source: string) {
  return extractWithBrowserParser(source) ?? extractWithoutDom(source);
}

export function titleFromHtmlFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.html?$/i, "");
  return normalizeTitle(withoutExtension || fileName) || "새 페이지";
}

export function deriveUploadTitle(source: string, fileName: string) {
  return extractHeadTitle(source) ?? titleFromHtmlFileName(fileName);
}
