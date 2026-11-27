/** 0 means the whole history. Which ranges a plan may use comes from lib/plans.ts. */
export const ANALYTICS_RANGE_OPTIONS = [7, 30, 90, 365, 0] as const;

export type AnalyticsRangeDays = (typeof ANALYTICS_RANGE_OPTIONS)[number];

export type AnalyticsSummary = {
  pageViews: number;
  sessions: number;
  clickSessions: number;
  clickRate: number;
  totalClicks: number;
  tagworksSessions: number;
};

export type AnalyticsSource = {
  key: string;
  type: string;
  label: string;
  sessions: number;
  clickSessions: number;
  totalClicks: number;
};

export type AnalyticsFlow = {
  sourceKey: string;
  sourceType: string;
  sourceLabel: string;
  linkId: string | null;
  linkLabel: string;
  sessions: number;
};

export type AnalyticsLink = {
  id: string;
  label: string;
  domain: string;
  url: string;
  firstClickSessions: number;
  clickSessions: number;
  totalClicks: number;
};

export type AnalyticsDailyRow = {
  date: string;
  sessions: number;
  clickSessions: number;
};

export type PageAnalytics = {
  updatedAt: string | null;
  rangeDays: AnalyticsRangeDays;
  summary: AnalyticsSummary;
  sources: AnalyticsSource[];
  flows: AnalyticsFlow[];
  links: AnalyticsLink[];
  daily: AnalyticsDailyRow[];
  tier: "basic" | "full";
  /** Summary of the previous period of the same length (full access only). */
  previous: AnalyticsSummary | null;
  /** Number of outbound links, even when only the top one is returned. */
  linkCount: number;
};

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.slice(0, 2048) : fallback;

const count = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};

const percentage = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 0;
};

const rows = <T>(value: unknown, parse: (row: JsonRecord) => T): T[] =>
  Array.isArray(value) ? value.filter(isRecord).map(parse) : [];

export function parseAnalyticsRange(value: string | string[] | undefined): AnalyticsRangeDays {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === "all") return 0;
  const number = Number(candidate);
  return ANALYTICS_RANGE_OPTIONS.includes(number as AnalyticsRangeDays)
    ? (number as AnalyticsRangeDays)
    : 30;
}

export function parsePageAnalytics(
  value: unknown,
  requestedRange: AnalyticsRangeDays,
): PageAnalytics | null {
  if (!isRecord(value) || !isRecord(value.summary)) return null;

  const summary = value.summary;
  const parseSummary = (row: JsonRecord): AnalyticsSummary => ({
    pageViews: count(row.pageViews),
    sessions: count(row.sessions),
    clickSessions: count(row.clickSessions),
    clickRate: percentage(row.clickRate),
    totalClicks: count(row.totalClicks),
    tagworksSessions: count(row.tagworksSessions),
  });
  const returnedRange = Number(value.rangeDays);
  const rangeDays = ANALYTICS_RANGE_OPTIONS.includes(returnedRange as AnalyticsRangeDays)
    ? (returnedRange as AnalyticsRangeDays)
    : requestedRange;

  return {
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    rangeDays,
    summary: parseSummary(summary),
    sources: rows(value.sources, (row) => ({
      key: text(row.key, "direct"),
      type: text(row.type, "direct"),
      label: text(row.label, "직접 방문·출처 불명"),
      sessions: count(row.sessions),
      clickSessions: count(row.clickSessions),
      totalClicks: count(row.totalClicks),
    })),
    flows: rows(value.flows, (row) => ({
      sourceKey: text(row.sourceKey, "direct"),
      sourceType: text(row.sourceType, "direct"),
      sourceLabel: text(row.sourceLabel, "직접 방문·출처 불명"),
      linkId: typeof row.linkId === "string" ? row.linkId : null,
      linkLabel: text(row.linkLabel, "외부 클릭 미관측"),
      sessions: count(row.sessions),
    })),
    links: rows(value.links, (row) => ({
      id: text(row.id),
      label: text(row.label, "이름 없는 링크"),
      domain: text(row.domain, "외부 링크"),
      url: text(row.url),
      firstClickSessions: count(row.firstClickSessions),
      clickSessions: count(row.clickSessions),
      totalClicks: count(row.totalClicks),
    })),
    daily: rows(value.daily, (row) => ({
      date: text(row.date),
      sessions: count(row.sessions),
      clickSessions: count(row.clickSessions),
    })),
    tier: value.tier === "full" ? "full" : "basic",
    previous: isRecord(value.previous) ? parseSummary(value.previous) : null,
    linkCount: value.linkCount === undefined ? (Array.isArray(value.links) ? value.links.length : 0) : count(value.linkCount),
  };
}

export function safeOutboundUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "mailto:" || url.protocol === "tel:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/** Ranges a plan may read: every option up to maxDays, or all when maxDays is null. */
export function rangesForPlan(maxDays: number | null) {
  return ANALYTICS_RANGE_OPTIONS.filter((days) => maxDays === null || (days !== 0 && days <= maxDays));
}

/** Relative change against the previous period, or null when there is nothing to compare. */
export function periodChange(current: number, previous: number | undefined) {
  if (previous === undefined || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

const csvCell = (value: string | number) => {
  const textValue = String(value);
  // Neutralize spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(textValue) ? `'${textValue}` : textValue;
  return `"${safe.replaceAll('"', '""')}"`;
};

/** CSV export of one page's analytics (full access). */
export function analyticsCsv(title: string, analytics: PageAnalytics) {
  const lines: Array<Array<string | number>> = [
    ["section", "key", "label", "sessions", "click_sessions", "total_clicks"],
    ["summary", "page_views", title, analytics.summary.pageViews, "", ""],
    ["summary", "sessions", title, analytics.summary.sessions, analytics.summary.clickSessions, analytics.summary.totalClicks],
    ...analytics.daily.map((row) => ["daily", row.date, "", row.sessions, row.clickSessions, ""]),
    ...analytics.sources.map((row) => ["source", row.type, row.label, row.sessions, row.clickSessions, row.totalClicks]),
    ...analytics.links.map((row) => ["link", row.url, row.label, row.firstClickSessions, row.clickSessions, row.totalClicks]),
    ...analytics.flows.map((row) => ["flow", row.sourceLabel, row.linkLabel, row.sessions, "", ""]),
  ];
  return "\uFEFF" + lines.map((line) => line.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
