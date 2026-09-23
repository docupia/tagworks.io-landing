import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseBrowserEnv } from "@/lib/env";

export const createClient = () => {
  const { url, publishableKey } = getSupabaseBrowserEnv();

  return createBrowserClient(url, publishableKey);
};
