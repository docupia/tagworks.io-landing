import { getEmailConfig } from "@/lib/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

/**
 * Sends a plain-text email through Resend. Returns false, without throwing,
 * when email is not configured or the provider refuses it, so a missing
 * email never breaks the action that triggered it.
 */
export async function sendEmail(message: EmailMessage, fetcher: typeof fetch = fetch): Promise<boolean> {
  const config = getEmailConfig();
  if (!config) return false;
  try {
    const response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject.replace(/[\r\n]+/g, " ").slice(0, 200),
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) console.error(`Email was not sent (${response.status}).`);
    return response.ok;
  } catch (error) {
    console.error("Email was not sent.", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Sends to the administrator inbox (ADMIN_EMAIL, info@tagworks.io by default). */
export async function sendAdminEmail(message: Omit<EmailMessage, "to">, fetcher?: typeof fetch) {
  const config = getEmailConfig();
  if (!config) return false;
  return sendEmail({ ...message, to: config.adminEmail }, fetcher);
}
