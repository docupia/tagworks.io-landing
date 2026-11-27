// Splits a drag-and-drop or file-picker selection into one HTML file and its
// images. Folders dropped as a whole are walked recursively.

import { ACCEPTED_IMAGE_TYPES } from "@/lib/upload-images";

export type Selection = { html: File[]; images: File[]; rejected: File[]; duplicates: string[] };

const isHtml = (file: File) => /\.html?$/i.test(file.name);
const IMAGE_BY_EXTENSION: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
};

export function imageType(file: File) {
  if ((ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return file.type;
  return IMAGE_BY_EXTENSION[file.name.split(".").at(-1)?.toLowerCase() ?? ""] ?? null;
}

const IGNORED = /^(?:\.|thumbs\.db$|desktop\.ini$)/i;
const NON_IMAGE_ASSET = /\.(?:css|js|mjs|json|map|txt|md|woff2?|ttf|otf)$/i;

export function splitSelection(files: File[]): Selection {
  const html: File[] = [];
  const images: File[] = [];
  const rejected: File[] = [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const file of files) {
    if (IGNORED.test(file.name)) continue;
    if (isHtml(file)) {
      html.push(file);
    } else if (imageType(file)) {
      if (seen.has(file.name)) duplicates.add(file.name);
      seen.add(file.name);
      images.push(file);
    } else if (!NON_IMAGE_ASSET.test(file.name)) {
      // SVG, HEIC and anything else unsupported. CSS and scripts in a
      // dropped folder are skipped silently because they are not uploaded.
      rejected.push(file);
    }
  }
  return { html, images, rejected, duplicates: [...duplicates] };
}

type Entry = {
  isFile: boolean;
  isDirectory: boolean;
  file?: (success: (file: File) => void, failure: (error: unknown) => void) => void;
  createReader?: () => { readEntries: (success: (entries: Entry[]) => void, failure: (error: unknown) => void) => void };
};

async function walk(entry: Entry, depth = 0): Promise<File[]> {
  if (entry.isFile && entry.file) {
    return [await new Promise<File>((resolve, reject) => entry.file!(resolve, reject))];
  }
  if (!entry.isDirectory || !entry.createReader || depth > 4) return [];
  const reader = entry.createReader();
  const files: File[] = [];
  // readEntries returns results in batches until an empty batch.
  for (;;) {
    const batch = await new Promise<Entry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    for (const child of batch) files.push(...await walk(child, depth + 1));
    if (files.length > 500) break;
  }
  return files;
}

/** Files from a drop event, including the contents of dropped folders. */
export async function filesFromDrop(transfer: DataTransfer): Promise<File[]> {
  const entries = [...transfer.items]
    .map((item) => (item.webkitGetAsEntry?.() ?? null) as unknown as Entry | null)
    .filter((entry): entry is Entry => Boolean(entry));
  if (!entries.length) return [...transfer.files];
  const files: File[] = [];
  for (const entry of entries) files.push(...await walk(entry));
  return files;
}
