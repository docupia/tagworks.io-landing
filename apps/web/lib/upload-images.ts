// Replaces local image references in uploaded HTML with stored image URLs.
// Covers src, srcset, poster, <link rel=icon> href and CSS url() in style
// attributes and <style> blocks. Matching is by file name, so images/a.png,
// ./a.png and a.png all match an uploaded a.png.

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const ACCEPTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"] as const;

const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|gif|svg|avif|ico|bmp|heic|heif|tiff?)$/i;
const NON_LOCAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/** The file-name part of a local reference, or null when it is not local. */
export function localImageName(reference: string) {
  const value = reference.trim();
  if (!value || NON_LOCAL.test(value)) return null;
  const path = value.split(/[?#]/, 1)[0];
  let name: string;
  try {
    name = decodeURIComponent(path.split("/").at(-1) ?? "");
  } catch {
    name = path.split("/").at(-1) ?? "";
  }
  return name || null;
}

export function rewriteUploadedImages(
  html: string,
  images: ReadonlyMap<string, string>,
  maxLength = Infinity,
) {
  const lowerCase = new Map([...images].map(([name, url]) => [name.toLowerCase(), url]));
  const missing = new Set<string>();
  const used = new Set<string>();

  const resolve = (reference: string, imageOnly: boolean) => {
    const name = localImageName(reference);
    if (!name) return null;
    const url = images.get(name) ?? lowerCase.get(name.toLowerCase());
    if (url) {
      used.add(url);
      return url;
    }
    if (!imageOnly || IMAGE_EXTENSION.test(name)) missing.add(reference.trim());
    return null;
  };

  const rewriteSrcset = (value: string) =>
    value.split(",").map((candidate) => {
      const match = candidate.match(/^(\s*)(\S+)(.*)$/s);
      if (!match) return candidate;
      const url = resolve(match[2], true);
      return url ? `${match[1]}${url}${match[3]}` : candidate;
    }).join(",");

  const rewriteCss = (css: string) =>
    css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (whole, quote: string, reference: string) => {
      const url = resolve(reference, true);
      return url ? `url(${quote}${url}${quote})` : whole;
    });

  // Attribute values. The attribute name must follow whitespace so script
  // property assignments such as img.src = "a.png" are left alone.
  let output = html.replace(
    /(\s)(src|srcset|poster|href|data-src|style)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi,
    (whole, space: string, name: string, equals: string, double?: string, single?: string, bare?: string) => {
      const value = double ?? single ?? bare ?? "";
      const quote = double !== undefined ? '"' : single !== undefined ? "'" : "";
      const attribute = name.toLowerCase();
      let next: string | null = null;
      if (attribute === "srcset") next = rewriteSrcset(value);
      else if (attribute === "style") next = rewriteCss(value);
      else if (attribute === "href") {
        // Only image-looking hrefs (icons, image links) are candidates.
        const local = localImageName(value);
        next = local && IMAGE_EXTENSION.test(local) ? resolve(value, true) : null;
      } else next = resolve(value, true);
      return next && next !== value ? `${space}${name}${equals}${quote}${next}${quote}` : whole;
    },
  );

  output = output.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (whole, open: string, css: string, close: string) =>
    `${open}${rewriteCss(css)}${close}`);

  if (output.length > maxLength) throw new RangeError("Image preview is too large");
  return { html: output, missing: [...missing], used: [...used] };
}

/** File-name normalization for storage paths. Original names are kept only for matching. */
export function storageImageName(index: number, name: string, contentType: string) {
  const extension = contentType === "image/webp" ? "webp"
    : contentType === "image/png" ? "png"
      : contentType === "image/gif" ? "gif"
        : "jpg";
  const base = name.replace(/\.[^.]*$/, "").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40) || "image";
  return `${String(index + 1).padStart(2, "0")}-${base}.${extension}`;
}

/** Detects the image type from its first bytes; returns null for anything else. */
export function sniffImageType(bytes: Uint8Array): (typeof ACCEPTED_IMAGE_TYPES)[number] | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "image/gif";
  return null;
}
