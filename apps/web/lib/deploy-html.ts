import { randomUUID } from "node:crypto";
import { getAccountPlan } from "@/lib/account-plan";
import { ApiError } from "@/lib/api-http";
import { validateDeploymentInput, validateUpdateInput } from "@/lib/deployment-input";
import { getPublisherUrl } from "@/lib/env";
import { checkPublishAllowed, commitPublish, decodeHtml, PublishError } from "@/lib/publish-page";
import { publicationUrls } from "@/lib/publication-url";
import { getPublicUsername } from "@/lib/public-username";

/** API and MCP clients get the same limits as the dashboard, with machine-readable codes. */
export class PlanLimitApiError extends ApiError {
  constructor(status: number, message: string, readonly code: string, readonly values: Record<string, string | number>) {
    super(status, message);
  }
}

function asApiError(error: unknown): never {
  if (error instanceof PublishError) {
    throw new PlanLimitApiError(error.status, error.message, error.code, error.values);
  }
  throw error;
}

async function publishFromApi(ownerId: string, html: string, target: { pageId: string } | { title: string; description: string | null }) {
  const account = await getAccountPlan(ownerId);
  const editId = "pageId" in target ? target.pageId : undefined;
  try {
    const existing = await checkPublishAllowed(account, ownerId, editId);
    const bytes = new TextEncoder().encode(html);
    const source = decodeHtml(bytes, account);
    const pageId = existing?.id ?? randomUUID();
    const versionId = randomUUID();
    const result = await commitPublish({
      ownerId,
      account,
      existing,
      pageId,
      versionId,
      title: existing?.title ?? ("title" in target ? target.title : ""),
      description: "description" in target ? target.description : null,
      source,
      sourceBytes: bytes.byteLength,
      images: [],
      original: { storage: "database", path: `${ownerId}/${pageId}/${versionId}/original.html` },
    });
    const urls = publicationUrls(result.page.slug, getPublisherUrl(), process.env.TAGWORKS_PUBLISHING_DOMAIN, await getPublicUsername(ownerId));
    return { page: result.page, ...urls, warnings: result.warnings };
  } catch (error) {
    asApiError(error);
  }
}

export async function deployHtml(ownerId: string, input: unknown) {
  const fields = validateDeploymentInput(input);
  return publishFromApi(ownerId, fields.html, { title: fields.title, description: fields.description });
}

/** Replaces the HTML of an existing link. The URL and QR code stay the same. */
export async function updateHtml(ownerId: string, input: unknown) {
  const fields = validateUpdateInput(input);
  return publishFromApi(ownerId, fields.html, { pageId: fields.pageId });
}

export async function planUsage(ownerId: string) {
  const account = await getAccountPlan(ownerId);
  const { limits } = account;
  return {
    plan: limits.plan,
    planName: limits.name,
    liveLinks: account.liveLinks,
    maxLinks: account.superAdmin ? null : limits.maxLinks,
    availableLinks: account.superAdmin ? null : Math.max(0, limits.maxLinks - account.liveLinks),
    canPublishNewLink: account.liveLinks < limits.maxLinks,
    editsPerHourPerLink: limits.editsPerHour,
    maxHtmlBytes: limits.maxHtmlBytes,
    note: "Edits to an existing link are unlimited (up to the hourly rate) and keep the same URL. Unpublish a link in the dashboard to free a slot.",
  };
}
