import type { User } from "@supabase/supabase-js";

export const SITE_VISITOR_COOKIE = "tagworks-vid";
export const SITE_VISITOR_MAX_AGE = 365 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEMBER_PATHS = ["/dashboard", "/pages", "/billing", "/auth", "/api"];

export type SiteVisitSummary = { range_days: number; visitors: number };

// Only public tagworks.io pages count; the member area and API do not.
export function isCountedSitePath(pathname: string) {
  return !MEMBER_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function validVisitorId(value: string | undefined) {
  return value && UUID.test(value) ? value.toLowerCase() : null;
}

export function canViewSiteVisits(user: Pick<User, "email" | "email_confirmed_at"> | null | undefined) {
  return user?.email?.toLowerCase() === "docupia@gmail.com" && Boolean(user.email_confirmed_at);
}
