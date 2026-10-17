import { getDatabase } from "@/lib/database";
import { hashApiKey, parseApiKey } from "@/lib/api-key-token";
import { ApiError } from "@/lib/api-http";

export async function authenticateApiRequest(request: Request) {
  const token = parseApiKey(request.headers.get("authorization"));
  if (!token) throw new ApiError(401, "A valid Personal API Key is required.");
  const sql = getDatabase();
  const [identity] = await sql<{ owner_id: string; rate_limited: boolean }[]>`
    select * from public.authenticate_personal_api_key(${hashApiKey(token)})
  `;
  if (!identity) throw new ApiError(401, "Invalid or revoked Personal API Key.");
  if (identity.rate_limited) throw new ApiError(429, "API rate limit exceeded. Try again in one minute.");
  return identity.owner_id;
}
