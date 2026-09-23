import { createClient } from "@supabase/supabase-js";

import { getPublisherEnvironment } from "./env";

export function createPublicSupabaseClient() {
  const { supabaseUrl, supabasePublishableKey } = getPublisherEnvironment();

  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "tagworks-publisher",
      },
    },
  });
}
