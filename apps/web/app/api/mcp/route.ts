import { authenticateApiRequest } from "@/lib/api-auth";
import { ApiError, apiErrorResponse, PRIVATE_HEADERS, readJsonBody } from "@/lib/api-http";
import { getUploadEntitlement } from "@/lib/billing";
import { deployHtml } from "@/lib/deploy-html";
import { MAX_DEPLOY_BODY_BYTES } from "@/lib/deployment-input";
import { getSiteUrl } from "@/lib/env";
import { handleMcpMessage, MCP_VERSIONS } from "@/lib/mcp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(getSiteUrl()).origin) throw new ApiError(403, "Origin not allowed.");
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ownerId = await authenticateApiRequest(request);
    const accept = request.headers.get("accept") ?? "";
    if (!accept.includes("application/json") || !accept.includes("text/event-stream")) throw new ApiError(406, "Accept must include application/json and text/event-stream.");
    const version = request.headers.get("mcp-protocol-version");
    if (version && !MCP_VERSIONS.includes(version)) throw new ApiError(400, "Unsupported MCP protocol version.");
    let input: unknown;
    try { input = await readJsonBody(request, MAX_DEPLOY_BODY_BYTES); }
    catch (error) {
      if (error instanceof ApiError && error.status === 400) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: PRIVATE_HEADERS });
      throw error;
    }
    const response = await handleMcpMessage(input, {
      deploy: args => deployHtml(ownerId, args),
      allowance: async () => {
        const value = await getUploadEntitlement(ownerId);
        return { ...value, unlimited: value.tier === "admin", totalRemaining: value.tier === "admin" ? null : value.totalRemaining };
      },
    });
    return response === null ? new Response(null, { status: 202, headers: PRIVATE_HEADERS }) : Response.json(response, { headers: PRIVATE_HEADERS });
  } catch (error) { return apiErrorResponse(error); }
}
export async function GET(request: Request) {
  try {
    checkOrigin(request);
    await authenticateApiRequest(request);
    return new Response(null, { status: 405, headers: { ...PRIVATE_HEADERS, Allow: "POST" } });
  } catch (error) { return apiErrorResponse(error); }
}
