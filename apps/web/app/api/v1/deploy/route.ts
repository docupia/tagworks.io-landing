import { authenticateApiRequest } from "@/lib/api-auth";
import { apiErrorResponse, PRIVATE_HEADERS, readJsonBody } from "@/lib/api-http";
import { MAX_DEPLOY_BODY_BYTES } from "@/lib/deployment-input";
import { deployHtml } from "@/lib/deploy-html";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const ownerId = await authenticateApiRequest(request);
    const input = await readJsonBody(request, MAX_DEPLOY_BODY_BYTES);
    return Response.json(await deployHtml(ownerId, input), { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) { return apiErrorResponse(error); }
}
