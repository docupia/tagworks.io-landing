"use server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { inquiryAdminEmail, parseCustomInquiry } from "@/lib/custom-inquiry";
import { getDatabase } from "@/lib/database";
import { sendAdminEmail } from "@/lib/email";
import { getSiteUrl } from "@/lib/env";
import { getLocale } from "@/lib/i18n-server";

export async function submitCustomInquiry(data: FormData) {
  // Bots fill every field; people never see this one.
  if (String(data.get("website") ?? "") !== "") redirect("/contact?sent=1");

  const locale = await getLocale();
  const parsed = parseCustomInquiry(data, locale);
  if (!parsed.ok) redirect(`/contact?error=${parsed.error}`);
  const input = parsed.value;
  const user = await getCurrentUser();
  const ownerId = user?.id ?? null;

  try {
    const sql = getDatabase();
    await sql`
      select public.submit_custom_inquiry(
        ${ownerId}::uuid, ${input.email}, ${input.links}::integer,
        ${input.views}::integer, ${input.useCase}, ${input.locale}
      )
    `;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P0429") {
      redirect("/contact?error=too_many");
    }
    throw error;
  }

  await sendAdminEmail(inquiryAdminEmail(input, ownerId, getSiteUrl()));
  redirect("/contact?sent=1");
}
