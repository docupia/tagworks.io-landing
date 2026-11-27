// Browser-only image optimization before upload. Users upload originals and
// the service stores small files: long edge at most 1920px, PNG/JPG turned
// into WebP (quality 80) when that is smaller, EXIF (including GPS) removed
// by re-encoding, GIFs left untouched so animations survive.

export const MAX_EDGE = 1920;
const WEBP_QUALITY = 0.8;
const JPEG_QUALITY = 0.88;

export type OptimizedImage = {
  /** Original file name; used only to match references in the HTML. */
  name: string;
  blob: Blob;
  type: string;
  originalBytes: number;
};

const canvasBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

export function scaledSize(width: number, height: number, maxEdge = MAX_EDGE) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function optimizeImage(file: File): Promise<OptimizedImage> {
  const original: OptimizedImage = { name: file.name, blob: file, type: file.type, originalBytes: file.size };
  if (file.type === "image/gif") return original;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const sourceWidth = bitmap.width;
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return original;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Transparency is kept: both WebP and PNG carry an alpha channel.
    const webp = await canvasBlob(canvas, "image/webp", WEBP_QUALITY);
    const sameType = await canvasBlob(canvas, file.type === "image/png" ? "image/png" : "image/jpeg",
      file.type === "image/png" ? undefined : JPEG_QUALITY);
    // Browsers without WebP encoding return PNG instead; that is still a valid candidate.
    const candidates = [webp, sameType].filter((blob): blob is Blob => Boolean(blob?.size));
    const smallest = candidates.sort((a, b) => a.size - b.size)[0];
    // A re-encoded copy has no EXIF. Keep the original only when nothing
    // smaller came out and the image was not resized.
    if (!smallest || (smallest.size >= file.size && width === sourceWidth && file.type !== "image/jpeg")) {
      return original;
    }
    return { name: file.name, blob: smallest, type: smallest.type, originalBytes: file.size };
  } catch {
    // Conversion failed in this browser; upload the original. Size limits still apply.
    return original;
  }
}
