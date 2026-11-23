import { GET as getPublishedPage } from "../../[slug]/route";
import { createPublicSupabaseClient } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await context.params;
  if (!/^[a-z][a-z0-9-]{2,29}$/.test(username)) {
    return new Response("Not found", { status: 404 });
  }
  const { data, error } = await createPublicSupabaseClient().rpc(
    "public_username_owns_page", { public_name: username, page_slug: slug },
  );
  if (error) return new Response("Unavailable", { status: 503 });
  if (data !== true) return new Response("Not found", { status: 404 });
  return getPublishedPage(request, { params: Promise.resolve({ slug }) });
}
