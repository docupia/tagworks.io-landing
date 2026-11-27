import { ApiError } from "@/lib/api-http";
import { PAGE_ID_PATTERN } from "@/lib/page-revisions";
import { PLANS } from "@/lib/plans";

export const MAX_DEPLOY_BODY_BYTES = 4 * 1024 * 1024;
/** Hard ceiling before plan limits are applied. */
const MAX_HTML_BYTES_ANY_PLAN = Math.max(...Object.values(PLANS).map((plan) => plan.maxHtmlBytes));

export type DeploymentInput = { html: string; title: string; description: string | null };
export type UpdateInput = { pageId: string; html: string };

function validateHtml(html: unknown) {
  if (typeof html !== "string" || !html.trim() || html.includes("\0") || !/<[a-z!][^>]*>/i.test(html)) throw new ApiError(400, "html must contain a valid HTML document.");
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES_ANY_PLAN) throw new ApiError(413, "HTML must be 2 MB or smaller.");
  return html;
}

function objectBody(input: unknown, keys: string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, `Expected an object with ${keys.slice(0, 2).join(" and ")}.`);
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some(key => !keys.includes(key))) throw new ApiError(400, "Unknown deployment field.");
  return body;
}

export function validateDeploymentInput(input: unknown): DeploymentInput {
  const body = objectBody(input, ["html", "title", "description"]);
  const html = validateHtml(body.html);
  if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 100) throw new ApiError(400, "title must contain 1 to 100 characters.");
  if (body.description !== undefined && body.description !== null && (typeof body.description !== "string" || body.description.trim().length > 300)) throw new ApiError(400, "description must contain at most 300 characters.");
  return { html, title: body.title.trim(), description: typeof body.description === "string" ? body.description.trim() || null : null };
}

export function validateUpdateInput(input: unknown): UpdateInput {
  const body = objectBody(input, ["pageId", "html"]);
  if (typeof body.pageId !== "string" || !PAGE_ID_PATTERN.test(body.pageId)) throw new ApiError(400, "pageId must be the id of one of your pages.");
  return { pageId: body.pageId.toLowerCase(), html: validateHtml(body.html) };
}
