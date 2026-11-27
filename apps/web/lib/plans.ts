// The single source of truth for plan limits. Upload, edit, analytics,
// billing and pricing code all read limits through resolveLimits/getLimits.

export const PLAN_IDS = ["free", "starter", "pro", "custom"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export type PublicPlanId = Exclude<PlanId, "custom">;
export type AnalyticsTier = "basic" | "full";

export type PlanLimits = {
  /** Links that can be live (published) at the same time. */
  maxLinks: number;
  /** One HTML file. */
  maxHtmlBytes: number;
  /** Images stored with one link. */
  maxImagesPerLink: number;
  /** One image before optimization. */
  maxImageBytes: number;
  /** HTML plus optimized images for one link. */
  maxLinkBytes: number;
  /** Edits per link per hour. */
  editsPerHour: number;
  /** Fair-use page views per account per calendar month (UTC). */
  monthlyViews: number;
  analytics: AnalyticsTier;
  /** Longest analytics range in days; null means the whole history. */
  analyticsMaxDays: number | null;
};

export type PlanDefinition = PlanLimits & {
  id: PlanId;
  name: string;
  /** Monthly price in USD; null for negotiated plans. */
  priceUsd: number | null;
  /** Yearly price in USD when billed annually; null when not offered. */
  annualPriceUsd: number | null;
};

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

const MB = 1024 * 1024;

const shared = {
  maxHtmlBytes: 2 * MB,
  editsPerHour: 20,
} as const;

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceUsd: 0,
    annualPriceUsd: null,
    ...shared,
    maxLinks: 1,
    maxImagesPerLink: 5,
    maxImageBytes: 2 * MB,
    maxLinkBytes: 5 * MB,
    monthlyViews: 1_000,
    analytics: "basic",
    analyticsMaxDays: 30,
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceUsd: 5,
    annualPriceUsd: 48,
    ...shared,
    maxLinks: 5,
    maxImagesPerLink: 10,
    maxImageBytes: 4 * MB,
    maxLinkBytes: 10 * MB,
    monthlyViews: 10_000,
    analytics: "basic",
    analyticsMaxDays: 30,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsd: 15,
    annualPriceUsd: 144,
    ...shared,
    maxLinks: 30,
    maxImagesPerLink: 20,
    maxImageBytes: 4 * MB,
    maxLinkBytes: 15 * MB,
    monthlyViews: 50_000,
    analytics: "full",
    analyticsMaxDays: null,
  },
  // Negotiated plan. Everything except the overrides follows Pro.
  custom: {
    id: "custom",
    name: "Custom",
    priceUsd: null,
    annualPriceUsd: null,
    ...shared,
    maxLinks: 31,
    maxImagesPerLink: 20,
    maxImageBytes: 4 * MB,
    maxLinkBytes: 15 * MB,
    monthlyViews: 50_000,
    analytics: "full",
    analyticsMaxDays: null,
  },
};

export const PUBLIC_PLAN_IDS: readonly PublicPlanId[] = ["free", "starter", "pro"];

/** Order used to tell upgrades from downgrades. */
export const PLAN_RANK: Record<PlanId, number> = { free: 0, starter: 1, pro: 2, custom: 3 };

/** Super administrators publish without a practical link limit. */
export const ADMIN_MAX_LINKS = 100_000;

/** Pro is the largest self-serve plan; beyond it we offer Custom. */
export const SELF_SERVE_MAX_LINKS = PLANS.pro.maxLinks;

export type PlanOverrides = Partial<Pick<PlanLimits, "maxLinks" | "monthlyViews">>;

export const isPlanId = (value: unknown): value is PlanId =>
  typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);

const positiveInteger = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;

export function parsePlanOverrides(value: unknown): PlanOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const overrides: PlanOverrides = {};
  const maxLinks = positiveInteger(record.maxLinks);
  const monthlyViews = positiveInteger(record.monthlyViews);
  if (maxLinks) overrides.maxLinks = maxLinks;
  if (monthlyViews) overrides.monthlyViews = monthlyViews;
  return overrides;
}

export type ResolvedLimits = PlanLimits & { plan: PlanId; name: string };

export function resolveLimits(
  plan: PlanId,
  overrides: PlanOverrides = {},
  options: { superAdmin?: boolean } = {},
): ResolvedLimits {
  const base = PLANS[plan];
  const limits: ResolvedLimits = {
    plan,
    name: base.name,
    maxLinks: base.maxLinks,
    maxHtmlBytes: base.maxHtmlBytes,
    maxImagesPerLink: base.maxImagesPerLink,
    maxImageBytes: base.maxImageBytes,
    maxLinkBytes: base.maxLinkBytes,
    editsPerHour: base.editsPerHour,
    monthlyViews: base.monthlyViews,
    analytics: base.analytics,
    analyticsMaxDays: base.analyticsMaxDays,
  };
  if (plan === "custom") {
    if (overrides.maxLinks) limits.maxLinks = overrides.maxLinks;
    if (overrides.monthlyViews) limits.monthlyViews = overrides.monthlyViews;
  }
  if (options.superAdmin) limits.maxLinks = ADMIN_MAX_LINKS;
  return limits;
}

/** Largest image (before optimization) any plan accepts; used for the storage bucket limit. */
export const MAX_IMAGE_BYTES_ANY_PLAN = Math.max(...PLAN_IDS.map((id) => PLANS[id].maxImageBytes));

export function formatBytes(bytes: number) {
  if (bytes >= MB) {
    const value = bytes / MB;
    return `${Number.isInteger(value) ? value : value.toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Fills {name} placeholders in an already translated message. */
export function fill(message: string, values: Record<string, string | number>) {
  return message.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
