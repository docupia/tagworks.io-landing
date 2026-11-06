import { Parser } from "htmlparser2";

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGES = 12;

const escapeAttribute = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

export function rewriteUploadedImages(
  html: string,
  images: ReadonlyMap<string, string>,
  maxLength = Infinity,
) {
  let outputLength = html.length;
  const missing = new Set<string>();
  const replacements: Array<{ start: number; end: number; markup: string }> = [];
  const parser = new Parser({
    onopentag(tag, attributes) {
      const src = attributes.src?.trim();
      if (tag !== "img" || !src || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)) return;

      let name: string;
      try {
        name = decodeURIComponent(src.split(/[?#]/, 1)[0].split("/").at(-1) ?? "");
      } catch {
        missing.add(src);
        return;
      }

      const url = images.get(name);
      if (!url) {
        missing.add(src);
        return;
      }

      outputLength += url.length - src.length;
      if (outputLength > maxLength) throw new RangeError("Image preview is too large");

      attributes.src = url;
      const serialized = Object.entries(attributes)
        .map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`)
        .join("");
      replacements.push({
        start: parser.startIndex,
        end: parser.endIndex + 1,
        markup: `<img${serialized}>`,
      });
    },
  });
  parser.end(html);

  let cursor = 0;
  const parts = replacements.map(({ start, end, markup }) => {
    const part = html.slice(cursor, start) + markup;
    cursor = end;
    return part;
  });
  return { html: parts.join("") + html.slice(cursor), missing: [...missing] };
}
