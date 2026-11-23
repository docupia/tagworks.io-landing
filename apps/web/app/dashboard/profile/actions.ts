"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getDatabase } from "@/lib/database";
import { PUBLIC_USERNAME_PATTERN } from "@/lib/public-username";

export async function savePublicUsername(data: FormData) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect("/login");
  const username = String(data.get("username") ?? "").trim().toLowerCase();
  if (!PUBLIC_USERNAME_PATTERN.test(username)) redirect("/dashboard/profile?error=invalid");
  try {
    const sql = getDatabase();
    await sql`select public.set_public_username(${user.id}::uuid,${username})`;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      redirect("/dashboard/profile?error=taken");
    }
    throw error;
  }
  revalidatePath("/", "layout");
  redirect("/dashboard/profile?saved=1");
}
