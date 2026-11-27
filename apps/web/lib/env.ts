const required = (name: string, value: string | undefined) => {
  if (!value) {
    throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`);
  }

  return value;
};

export const getSupabaseBrowserEnv = () => ({
  url: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  publishableKey: required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
});

export const getSiteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const getPublisherUrl = () =>
  (process.env.NEXT_PUBLIC_PUBLISHER_URL ?? "http://localhost:3001").replace(/\/$/, "");

export const getPayPalEnv = () => {
  const value = required("PAYPAL_ENV", process.env.PAYPAL_ENV);
  if (value !== "sandbox" && value !== "live") {
    throw new Error("PAYPAL_ENV must be either sandbox or live.");
  }
  return value;
};

export const getPayPalApiConfig = () => ({
  environment: getPayPalEnv(),
  clientId: required("PAYPAL_CLIENT_ID", process.env.PAYPAL_CLIENT_ID),
  clientSecret: required("PAYPAL_CLIENT_SECRET", process.env.PAYPAL_CLIENT_SECRET),
});

/** PayPal billing plan IDs for each paid plan and billing interval. */
export const getPayPalPlanIds = () => ({
  starter: {
    month: required("PAYPAL_STARTER_MONTHLY_PLAN_ID", process.env.PAYPAL_STARTER_MONTHLY_PLAN_ID),
    year: required("PAYPAL_STARTER_YEARLY_PLAN_ID", process.env.PAYPAL_STARTER_YEARLY_PLAN_ID),
  },
  pro: {
    month: required("PAYPAL_PRO_MONTHLY_PLAN_ID", process.env.PAYPAL_PRO_MONTHLY_PLAN_ID),
    year: required("PAYPAL_PRO_YEARLY_PLAN_ID", process.env.PAYPAL_PRO_YEARLY_PLAN_ID),
  },
});

export const getPayPalWebhookId = () =>
  required("PAYPAL_WEBHOOK_ID", process.env.PAYPAL_WEBHOOK_ID);

export const getDatabaseUrl = () => {
  const value = required("SUPABASE_DATABASE_URL", process.env.SUPABASE_DATABASE_URL);
  const parsed = new URL(value);

  if (!decodeURIComponent(parsed.username).startsWith("tagworks_ingest.")) {
    throw new Error("SUPABASE_DATABASE_URL은 tagworks_ingest 최소 권한 역할이어야 합니다.");
  }

  return value;
};

export const getAnalyticsDatabaseUrl = () => {
  const value = required(
    "SUPABASE_ANALYTICS_DATABASE_URL",
    process.env.SUPABASE_ANALYTICS_DATABASE_URL,
  );
  const parsed = new URL(value);

  if (!decodeURIComponent(parsed.username).startsWith("tagworks_analytics.")) {
    throw new Error(
      "SUPABASE_ANALYTICS_DATABASE_URL은 tagworks_analytics 최소 권한 역할이어야 합니다.",
    );
  }

  return value;
};

/** Email sending is optional: without RESEND_API_KEY, emails are skipped. */
export const getEmailConfig = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    from: process.env.EMAIL_FROM ?? "TagWorks <noreply@tagworks.io>",
    adminEmail: process.env.ADMIN_EMAIL ?? "info@tagworks.io",
  };
};

/** Shared secret for the scheduled job route; the route is disabled without it. */
export const getCronSecret = () => process.env.CRON_SECRET || null;
