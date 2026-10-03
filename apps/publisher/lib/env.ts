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

export function getAnalyticsEventsUrl(): string {
  const value =
    process.env.TAGWORKS_ANALYTICS_EVENTS_URL?.trim() ||
    "http://localhost:3000/api/events";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("TAGWORKS_ANALYTICS_EVENTS_URL must be a valid URL.");
  }

  if (
    parsed.pathname !== "/api/events" ||
    parsed.search ||
    parsed.hash ||
    (parsed.protocol !== "https:" && parsed.hostname !== "localhost")
  ) {
    throw new Error("TAGWORKS_ANALYTICS_EVENTS_URL must point to a secure /api/events endpoint.");
  }

  return parsed.href;
}
