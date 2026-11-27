import assert from "node:assert/strict";
import test from "node:test";
import { inquiryAdminEmail, parseCustomInquiry } from "../lib/custom-inquiry";
import { parseCustomPlanForm } from "../lib/admin";
import { ownerUsageEmail, usageNoticeLevel } from "../lib/monthly-usage";
import { isAuthorizedCron, planChangeEmail, reminderFor } from "../lib/scheduled-jobs";
import { sendEmail } from "../lib/email";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

test("custom inquiry form is validated", () => {
  const ok = parseCustomInquiry(form({ email: " Lead@Example.com ", links: "50", views: "200000", use_case: " Store pages " }), "ko");
  assert.deepEqual(ok, { ok: true, value: { email: "lead@example.com", links: 50, views: 200000, useCase: "Store pages", locale: "ko" } });
  assert.deepEqual(parseCustomInquiry(form({ email: "nope", links: "50", use_case: "x" }), "en"), { ok: false, error: "email" });
  assert.deepEqual(parseCustomInquiry(form({ email: "a@b.co", links: "30", use_case: "x" }), "en"), { ok: false, error: "links" });
  assert.deepEqual(parseCustomInquiry(form({ email: "a@b.co", links: "31", use_case: " " }), "en"), { ok: false, error: "use_case" });
  const unknownViews = parseCustomInquiry(form({ email: "a@b.co", links: "31", views: "123", use_case: "x" }), "xx");
  assert.ok(unknownViews.ok && unknownViews.value.views === null && unknownViews.value.locale === "en");
});

test("inquiry email replies to the customer", () => {
  const email = inquiryAdminEmail({ email: "lead@example.com", links: 80, views: 1_000_000, useCase: "Events", locale: "ja" }, null, "https://tagworks.io");
  assert.equal(email.replyTo, "lead@example.com");
  assert.match(email.subject, /80 links/);
  assert.match(email.text, /200,000–1,000,000/);
  assert.match(email.text, /not signed in/);
});

test("admin custom plan form", () => {
  assert.deepEqual(parseCustomPlanForm(form({ plan: "custom", max_links: "120", monthly_views: "300000", price_usd: "89.999", note: " Annual " })),
    { ok: true, value: { plan: "custom", maxLinks: 120, monthlyViews: 300000, priceUsd: 90, note: "Annual" } });
  assert.deepEqual(parseCustomPlanForm(form({ plan: "custom", max_links: "0" })), { ok: false });
  assert.deepEqual(parseCustomPlanForm(form({ plan: "custom", max_links: "10", price_usd: "-1" })), { ok: false });
  assert.deepEqual(parseCustomPlanForm(form({ plan: "free", max_links: "bad" })),
    { ok: true, value: { plan: "free", maxLinks: null, monthlyViews: null, priceUsd: null, note: "" } });
});

test("usage notices start at 80% and never block", () => {
  assert.equal(usageNoticeLevel({ percent: 79, limit: 1000 }), 0);
  assert.equal(usageNoticeLevel({ percent: 80, limit: 1000 }), 80);
  assert.equal(usageNoticeLevel({ percent: 340, limit: 1000 }), 100);
  assert.equal(usageNoticeLevel({ percent: 0, limit: 0 }), 0);
  const email = ownerUsageEmail("en", 100, { pageViews: 12000, limit: 10000, percent: 120 }, "Starter");
  assert.match(email.subject, /10,000/);
  assert.match(email.text, /stay online/);
});

test("cron secret is required and compared exactly", () => {
  assert.equal(isAuthorizedCron("Bearer s3cret", "s3cret"), true);
  assert.equal(isAuthorizedCron("Bearer s3cre", "s3cret"), false);
  assert.equal(isAuthorizedCron("Bearer s3cret", null), false);
  assert.equal(isAuthorizedCron(null, "s3cret"), false);
});

test("downgrade reminders go out 7 days and 1 day before", () => {
  const now = new Date("2026-12-01T00:00:00Z");
  const at = (hours: number) => new Date(now.getTime() + hours * 3600_000);
  assert.equal(reminderFor(at(7 * 24), now), 7);
  assert.equal(reminderFor(at(6 * 24 + 1), now), 7);
  assert.equal(reminderFor(at(6 * 24), now), null);
  assert.equal(reminderFor(at(12), now), 1);
  assert.equal(reminderFor(at(-1), now), null);
  const email = planChangeEmail({ owner_id: "o", email: "a@b.co", current_plan: "pro", next_plan: "starter", change_at: at(24 * 7), live_links: 12 }, 7, "https://tagworks.io");
  assert.match(email.subject, /Starter in 7 days/);
  assert.match(email.text, /7 of your 12 links will become private/);
});

test("email is skipped without configuration and sent with it", async () => {
  delete process.env.RESEND_API_KEY;
  let calls = 0;
  const fetcher = (async () => { calls += 1; return new Response("{}", { status: 200 }); }) as typeof fetch;
  assert.equal(await sendEmail({ to: "a@b.co", subject: "Hi", text: "x" }, fetcher), false);
  assert.equal(calls, 0);
  process.env.RESEND_API_KEY = "re_test";
  let body: Record<string, unknown> = {};
  const capture = (async (_url: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
  assert.equal(await sendEmail({ to: "a@b.co", subject: "Hi\nthere", text: "x", replyTo: "c@d.co" }, capture), true);
  assert.equal(body.subject, "Hi there");
  assert.equal(body.reply_to, "c@d.co");
  delete process.env.RESEND_API_KEY;
});
