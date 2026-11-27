import { authenticateApiRequest } from "@/lib/api-auth";
import { ApiError, apiErrorResponse, PRIVATE_HEADERS, readJsonBody } from "@/lib/api-http";
import { MAX_DEPLOY_BODY_BYTES } from "@/lib/deployment-input";
import { updateHtml } from "@/lib/deploy-html";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Replaces the HTML of an existing page. Body: { "html": "..." }. */
export async function PUT(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  try {
    const ownerId = await authenticateApiRequest(request);
    const { pageId } = await params;
    const input = await readJsonBody(request, MAX_DEPLOY_BODY_BYTES);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "Expected an object with html.");
    return Response.json(await updateHtml(ownerId, { ...(input as object), pageId }), { headers: PRIVATE_HEADERS });
  } catch (error) { return apiErrorResponse(error); }
}
