import { type NextRequest } from "next/server";
import { ApiError, apiErrorResponse, PRIVATE_HEADERS, readJsonBody } from "@/lib/api-http";
import { generateApiKey } from "@/lib/api-key-token";
import { isSameOriginMutation } from "@/lib/request-security";
import { createClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginMutation(request)) throw new ApiError(403, "Request not allowed.");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new ApiError(401, "Log in to continue.");
    const body = await readJsonBody(request, 1024) as { name?: unknown };
    if (!body || typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80) throw new ApiError(400, "Key name must contain 1 to 80 characters.");
    const key = generateApiKey();
    const { data, error } = await supabase.rpc("create_personal_api_key", { key_name: body.name.trim(), token_hash: key.hash, token_prefix: key.prefix });
    if (error) throw new ApiError(400, "Could not create key. You may have at most 10 active keys.");
    return Response.json({ id: data, token: key.token }, { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) { return apiErrorResponse(error); }
}
export async function DELETE(request: NextRequest) {
  try {
    if (!isSameOriginMutation(request)) throw new ApiError(403, "Request not allowed.");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new ApiError(401, "Log in to continue.");
    const body = await readJsonBody(request, 1024) as { id?: unknown };
    if (!body || typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) throw new ApiError(400, "Invalid key ID.");
    const { data, error } = await supabase.rpc("revoke_personal_api_key", { key_id: body.id });
    if (error) throw new ApiError(503, "Could not revoke key.");
    if (!data) throw new ApiError(404, "Active key not found.");
    return new Response(null, { status: 204, headers: PRIVATE_HEADERS });
  } catch (error) { return apiErrorResponse(error); }
}
