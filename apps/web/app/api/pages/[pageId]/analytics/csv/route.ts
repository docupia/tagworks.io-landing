import { NextResponse, type NextRequest } from "next/server";
import { getAccountPlan } from "@/lib/account-plan";
import { analyticsCsv, parseAnalyticsRange } from "@/lib/analytics";
import { getDatabase } from "@/lib/database";
import { PAGE_ID_PATTERN } from "@/lib/page-revisions";
import { loadPageAnalytics } from "@/lib/plan-analytics";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CSV export, available on plans with full analytics. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  if (!PAGE_ID_PATTERN.test(pageId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Log in to continue." }, { status: 401 });

  const account = await getAccountPlan(user.id);
  if (account.limits.analytics !== "full") {
    return NextResponse.json({ error: "CSV export is available on Pro.", code: "plan_required" }, { status: 403 });
  }
  const [page] = await getDatabase()<{ title: string; slug: string }[]>`
    select title, slug from public.pages where id = ${pageId}::uuid and owner_id = ${user.id}::uuid and deleted_at is null
  `;
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const range = parseAnalyticsRange(request.nextUrl.searchParams.get("range") ?? "30");
  const analytics = await loadPageAnalytics(user.id, pageId, range, account.limits);
  if (!analytics) return NextResponse.json({ error: "Analytics are not available right now." }, { status: 503 });

  return new Response(analyticsCsv(page.title, analytics), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tagworks-${page.slug}-${range === 0 ? "all" : `${range}d`}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
