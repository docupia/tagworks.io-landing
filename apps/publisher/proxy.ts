import { NextResponse, type NextRequest } from "next/server";
import { publicationSlug } from "./lib/subdomain";
export function proxy(request: NextRequest) {
  const slug = publicationSlug(request.headers.get("host") ?? "", process.env.TAGWORKS_PUBLISHING_DOMAIN);
  if (!slug) return NextResponse.next();
  if (request.nextUrl.pathname === "/") {
    const target = request.nextUrl.clone();
    target.pathname = `/p/${slug}`;
    return NextResponse.rewrite(target);
  }
  // Keep each subdomain bound to its own page; retain the analytics relay.
  if (request.nextUrl.pathname === "/api/events") return NextResponse.next();
  return new NextResponse("Not found", { status: 404 });
}
