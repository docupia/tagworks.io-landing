export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export const PRIVATE_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "Content-Type must be application/json.");
  }
  if (Number(request.headers.get("content-length")) > maxBytes) throw new ApiError(413, "Request body is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ApiError(413, "Request body is too large."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new ApiError(400, "Invalid JSON body."); }
  } finally { reader.releaseLock(); }
}

export function apiErrorResponse(error: unknown) {
  const known = error instanceof ApiError;
  if (!known) console.error("TagWorks API request failed");
  // Plan-limit errors carry a stable code and values so agents can react.
  const detail = known && "code" in error
    ? { code: (error as ApiError & { code: string }).code, values: (error as ApiError & { values?: unknown }).values }
    : {};
  const values = (detail as { values?: Record<string, unknown> }).values;
  const retryAfter = known && error.status === 429
    ? String(typeof values?.retryAfter === "number" ? values.retryAfter : 60)
    : null;
  return Response.json({ error: known ? error.message : "Service temporarily unavailable.", ...detail }, {
    status: known ? error.status : 503,
    headers: { ...PRIVATE_HEADERS, ...(known && error.status === 401 ? { "WWW-Authenticate": 'Bearer realm="tagworks"' } : {}), ...(retryAfter ? { "Retry-After": retryAfter } : {}) },
  });
}
