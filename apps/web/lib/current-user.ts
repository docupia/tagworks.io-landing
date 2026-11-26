import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Share verified user lookup within a server render, never across requests.
export const getCurrentUser = cache(async () => {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user;
});
