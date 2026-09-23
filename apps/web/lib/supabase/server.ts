import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseBrowserEnv } from "@/lib/env";

export const createClient = async () => {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabaseBrowserEnv();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies. proxy.ts refreshes them instead.
        }
      },
    },
  });
};
