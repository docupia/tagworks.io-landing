import { LOCALES, type Locale } from "@/lib/i18n";
import { SELF_SERVE_MAX_LINKS } from "@/lib/plans";

export const VIEW_RANGES = [
  { value: 50_000, label: "Up to 50,000" },
  { value: 200_000, label: "50,000–200,000" },
  { value: 1_000_000, label: "200,000–1,000,000" },
  { value: 5_000_000, label: "More than 1,000,000" },
] as const;

export type CustomInquiryInput = {
  email: string;
  links: number;
  views: number | null;
  useCase: string;
  locale: Locale;
};

export type InquiryError = "email" | "links" | "use_case";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Validates the contact form. Returns the cleaned input or the first field error. */
export function parseCustomInquiry(data: FormData, locale: string):
  { ok: true; value: CustomInquiryInput } | { ok: false; error: InquiryError } {
  const email = String(data.get("email") ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return { ok: false, error: "email" };
  const links = Number(String(data.get("links") ?? "").trim());
  if (!Number.isInteger(links) || links < SELF_SERVE_MAX_LINKS + 1 || links > 100_000) {
    return { ok: false, error: "links" };
  }
  const viewsRaw = Number(data.get("views"));
  const views = VIEW_RANGES.some((range) => range.value === viewsRaw) ? viewsRaw : null;
  const useCase = String(data.get("use_case") ?? "").trim().replace(/\r\n/g, "\n");
  if (useCase.length < 1 || useCase.length > 2000) return { ok: false, error: "use_case" };
  return {
    ok: true,
    value: {
      email,
      links,
      views,
      useCase,
      locale: (LOCALES as readonly string[]).includes(locale) ? (locale as Locale) : "en",
    },
  };
}

export function inquiryAdminEmail(input: CustomInquiryInput, ownerId: string | null, siteUrl: string) {
  const views = VIEW_RANGES.find((range) => range.value === input.views)?.label ?? "Not sure";
  return {
    subject: `[TagWorks] Custom plan inquiry: ${input.links} links`,
    replyTo: input.email,
    text: [
      `Email: ${input.email}`,
      `Account: ${ownerId ?? "not signed in"}`,
      `Links needed: ${input.links}`,
      `Expected monthly views: ${views}`,
      `Language: ${input.locale}`,
      "",
      "Use case:",
      input.useCase,
      "",
      `${siteUrl}/admin`,
    ].join("\n"),
  };
}
