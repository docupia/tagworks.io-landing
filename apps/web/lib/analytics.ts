export const ANALYTICS_RANGE_OPTIONS = [7, 30, 90] as const;

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
  const returnedRange = Number(value.rangeDays);
  const rangeDays = ANALYTICS_RANGE_OPTIONS.includes(returnedRange as AnalyticsRangeDays)
    ? (returnedRange as AnalyticsRangeDays)
    : requestedRange;

  return {
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    rangeDays,
    summary: {
      pageViews: count(summary.pageViews),
      sessions: count(summary.sessions),
      clickSessions: count(summary.clickSessions),
      clickRate: percentage(summary.clickRate),
      totalClicks: count(summary.totalClicks),
      tagworksSessions: count(summary.tagworksSessions),
    },
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
