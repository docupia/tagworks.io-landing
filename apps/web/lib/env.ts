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

export const getDatabaseUrl = () => {
  const value = required("SUPABASE_DATABASE_URL", process.env.SUPABASE_DATABASE_URL);
  const parsed = new URL(value);

  if (!decodeURIComponent(parsed.username).startsWith("tagworks_ingest.")) {
    throw new Error("SUPABASE_DATABASE_URL은 tagworks_ingest 최소 권한 역할이어야 합니다.");
  }

  return value;
};
