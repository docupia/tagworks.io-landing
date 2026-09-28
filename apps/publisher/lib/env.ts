type PublisherEnvironment = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

let cachedEnvironment: PublisherEnvironment | undefined;

export function getPublisherEnvironment(): PublisherEnvironment {
  if (cachedEnvironment) {
    return cachedEnvironment;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Publisher Supabase environment variables are not configured.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("SUPABASE_URL must be a valid URL.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("SUPABASE_URL must use HTTPS.");
  }

  cachedEnvironment = { supabaseUrl: parsedUrl.origin, supabasePublishableKey };
  return cachedEnvironment;
}

export function getAnalyticsDatabaseUrl(): string {
  const value = process.env.SUPABASE_ANALYTICS_DATABASE_URL?.trim();
  if (!value) {
    throw new Error("SUPABASE_ANALYTICS_DATABASE_URL is not configured.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("SUPABASE_ANALYTICS_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("SUPABASE_ANALYTICS_DATABASE_URL must use PostgreSQL.");
  }

  const role = decodeURIComponent(parsed.username).split(".", 1)[0];
  if (role !== "tagworks_analytics") {
    throw new Error(
      "SUPABASE_ANALYTICS_DATABASE_URL must use the least-privilege tagworks_analytics role.",
    );
  }

  return value;
}
