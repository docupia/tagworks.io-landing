import { ApiError } from "@/lib/api-http";
export const MAX_DEPLOY_BODY_BYTES = 7 * 1024 * 1024;
export type DeploymentInput = { html: string; title: string; description: string | null };
export function validateDeploymentInput(input: unknown): DeploymentInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "Expected an object with html and title.");
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(key => !["html", "title", "description"].includes(key))) throw new ApiError(400, "Unknown deployment field.");
  if (typeof body.html !== "string" || !body.html.trim() || body.html.includes("\0") || !/<[a-z!][^>]*>/i.test(body.html)) throw new ApiError(400, "html must contain a valid HTML document.");
  if (Buffer.byteLength(body.html, "utf8") > 1048576) throw new ApiError(413, "HTML must be 1 MiB or smaller.");
  if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 100) throw new ApiError(400, "title must contain 1 to 100 characters.");
  if (body.description !== undefined && body.description !== null && (typeof body.description !== "string" || body.description.trim().length > 300)) throw new ApiError(400, "description must contain at most 300 characters.");
  return { html: body.html, title: body.title.trim(), description: typeof body.description === "string" ? body.description.trim() || null : null };
}
