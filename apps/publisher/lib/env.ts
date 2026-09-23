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
