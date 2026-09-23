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

export const getDatabaseUrl = () =>
  required("SUPABASE_DATABASE_URL", process.env.SUPABASE_DATABASE_URL);
