import { createHash, randomBytes } from "node:crypto";
import { getDatabase } from "@/lib/database";
import type { AccountPlan } from "@/lib/account-plan";
import { prepareOriginalPublishedHtml, SANITIZER_VERSION } from "@/lib/html-sanitizer";
import type { LimitCode, LimitValues } from "@/lib/limit-messages";
import { SELF_SERVE_MAX_LINKS } from "@/lib/plans";
import { rewriteUploadedImages } from "@/lib/upload-images";

/** A limit or validation failure with a stable code for UI and API clients. */
export class PublishError extends Error {
  constructor(
    readonly status: number,
    readonly code: LimitCode | "not_found" | "invalid_html" | "not_utf8" | "expired",
    readonly values: LimitValues = {},
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type ExistingPage = {
  id: string;
  slug: string;
  title: string;
  status: "published" | "paused";
  publishedVersionId: string | null;
};

export function linkLimitError(account: AccountPlan) {
  const { limits } = account;
  // Pro and Custom are the top self-serve tiers: point them to a custom quote.
  if (limits.maxLinks >= SELF_SERVE_MAX_LINKS) {
    return new PublishError(402, "custom_needed", { n: limits.maxLinks, plan: limits.name },
      `Need more than ${limits.maxLinks} links? Tell us how many and we'll set it up for you.`);
  }
  return new PublishError(402, "link_limit", { n: limits.maxLinks, plan: limits.name },
    `You're using all ${limits.maxLinks} links on ${limits.name}. Upgrade for more, or unpublish a link to free a slot.`);
}

/** Checks a new link can be published, or an edit is allowed, before anything is stored. */
export async function checkPublishAllowed(account: AccountPlan, ownerId: string, pageId?: string) {
  const sql = getDatabase();
  if (!pageId) {
    if (account.liveLinks >= account.limits.maxLinks) throw linkLimitError(account);
    return null;
  }

  const [page] = await sql<{
    id: string; slug: string; title: string; status: "published" | "paused"; published_version_id: string | null;
  }[]>`
    select id, slug, title, status, published_version_id
    from public.pages
    where id = ${pageId}::uuid
      and owner_id = ${ownerId}::uuid
      and deleted_at is null
      and status in ('published', 'paused')
  `;
  if (!page) throw new PublishError(404, "not_found", {}, "Page not found.");

  const [{ retry_after: retryAfter }] = await sql<{ retry_after: number }[]>`
    select public.page_edit_retry_after(${pageId}::uuid, ${account.limits.editsPerHour}) as retry_after
  `;
  if (retryAfter > 0) {
    const minutes = Math.max(1, Math.ceil(retryAfter / 60));
    throw new PublishError(429, "edit_rate", { minutes, retryAfter },
      `Too many edits in the last hour. Try again in ${minutes} min.`);
  }

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    status: page.status,
    publishedVersionId: page.published_version_id,
  } satisfies ExistingPage;
}

/** Decodes and size-checks one HTML file. */
export function decodeHtml(bytes: Uint8Array, account: AccountPlan, fileName = "HTML") {
  const { limits } = account;
  if (bytes.byteLength > limits.maxHtmlBytes) {
    throw new PublishError(413, "file_too_large",
      { file: fileName, size: bytes.byteLength, plan: limits.name, limit: limits.maxHtmlBytes },
      `${fileName} is larger than the ${limits.maxHtmlBytes}-byte limit on ${limits.name}.`);
  }
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    throw new PublishError(400, "not_utf8", {}, "Only UTF-8 encoded HTML can be published.");
  }
  if (source.includes("\0") || !/<[a-z!][^>]*>/i.test(source)) {
    throw new PublishError(400, "invalid_html", {}, "Choose a valid HTML document.");
  }
  return source;
}

export type ImageCandidate = { name: string; bytes: number; originalBytes?: number };

/** Checks image count, per-image size and the link's total size. */
export function checkImageLimits(account: AccountPlan, htmlBytes: number, images: ImageCandidate[]) {
  const { limits } = account;
  if (images.length > limits.maxImagesPerLink) {
    throw new PublishError(413, "too_many_images", { count: images.length, plan: limits.name, limit: limits.maxImagesPerLink },
      `${limits.name} allows ${limits.maxImagesPerLink} images per link.`);
  }
  for (const image of images) {
    const size = image.originalBytes ?? image.bytes;
    if (size > limits.maxImageBytes) {
      throw new PublishError(413, "file_too_large", { file: image.name, size, plan: limits.name, limit: limits.maxImageBytes },
        `${image.name} is larger than the ${limits.maxImageBytes}-byte limit on ${limits.name}.`);
    }
  }
  const total = htmlBytes + images.reduce((sum, image) => sum + image.bytes, 0);
  if (total > limits.maxLinkBytes) {
    const largest = [...images].sort((a, b) => b.bytes - a.bytes).slice(0, 3).map((image) => image.name).join(", ");
    throw new PublishError(413, "link_too_large", { size: total, plan: limits.name, limit: limits.maxLinkBytes, largest },
      `This page is ${total} bytes after optimization. ${limits.name} allows ${limits.maxLinkBytes} bytes per link.`);
  }
  return total;
}

export type StoredImage = { name: string; url: string; path: string; bytes: number };

export type CommitInput = {
  ownerId: string;
  account: AccountPlan;
  existing: ExistingPage | null;
  pageId: string;
  versionId: string;
  title: string;
  description: string | null;
  source: string;
  sourceBytes: number;
  images: StoredImage[];
  original: { storage: "storage"; path: string; reservationId: string } | { storage: "database"; path: string };
};

export type CommitResult = {
  page: { id: string; slug: string; title: string };
  warnings: string[];
  missingImages: string[];
  usedImagePaths: string[];
  unusedImagePaths: string[];
  previousVersion: { id: string; sourcePath: string | null; imagePaths: string[] } | null;
};

/** Rewrites image paths and commits the new link or version in one transaction. */
export async function commitPublish(input: CommitInput): Promise<CommitResult> {
  const sql = getDatabase();
  const urls = new Map(input.images.map((image) => [image.name, image.url]));
  const rewritten = rewriteUploadedImages(input.source, urls);
  const usedUrls = new Set(rewritten.used);
  const used = input.images.filter((image) => usedUrls.has(image.url));
  const unused = input.images.filter((image) => !usedUrls.has(image.url));
  // Warnings describe the author's document, not the storage URLs we add.
  const warnings = prepareOriginalPublishedHtml(input.source, { versionId: input.versionId }).warnings;
  const published = prepareOriginalPublishedHtml(rewritten.html, {
    fallbackTitle: input.title,
    versionId: input.versionId,
  });
  const slug = input.existing?.slug ?? `page-${randomBytes(6).toString("hex")}`;
  const sha256 = createHash("sha256").update(input.source).digest("hex");
  const totalBytes = input.sourceBytes + used.reduce((sum, image) => sum + image.bytes, 0);
  let previousVersion: CommitResult["previousVersion"] = null;

  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as typeof sql;
    await tx`select pg_advisory_xact_lock(hashtextextended(${input.ownerId}::text, 81))`;

    if (!input.existing) {
      const [{ live }] = await tx<{ live: number }[]>`
        select count(*)::integer as live
        from public.pages
        where owner_id = ${input.ownerId}::uuid and status = 'published' and deleted_at is null
      `;
      if (live >= input.account.limits.maxLinks) throw linkLimitError(input.account);
      await tx`
        insert into public.pages (id, owner_id, slug, title, description, status)
        values (${input.pageId}::uuid, ${input.ownerId}::uuid, ${slug}, ${input.title}, ${input.description}, 'draft')
      `;
    } else if (input.existing.publishedVersionId) {
      const [previous] = await tx<{ id: string; source_object_path: string; source_storage: string; image_paths: string[] | null }[]>`
        select id, source_object_path, source_storage, image_paths
        from public.page_versions
        where id = ${input.existing.publishedVersionId}::uuid
      `;
      if (previous) {
        previousVersion = {
          id: previous.id,
          sourcePath: previous.source_storage === "storage" ? previous.source_object_path : null,
          imagePaths: previous.image_paths ?? [],
        };
      }
    }

    await tx`
      insert into public.page_versions (
        id, page_id, source_object_path, source_sha256, source_bytes,
        sanitized_html, sanitizer_version, warnings, source_storage, original_html,
        image_paths, image_count, total_bytes
      ) values (
        ${input.versionId}::uuid,
        ${input.pageId}::uuid,
        ${input.original.path},
        ${sha256},
        ${input.sourceBytes},
        ${published.html},
        ${SANITIZER_VERSION},
        ${tx.json(warnings)},
        ${input.original.storage},
        ${input.original.storage === "database" ? input.source : null},
        ${used.map((image) => image.path)},
        ${used.length},
        ${totalBytes}
      )
    `;
    if (published.outboundLinks.length) {
      const rows = published.outboundLinks.map((link) => ({
        id: link.id,
        page_id: input.pageId,
        page_version_id: input.versionId,
        ordinal: link.ordinal,
        label: link.label,
        destination_url: link.destinationUrl,
        destination_host: link.destinationHost,
      }));
      await tx`insert into public.page_links ${tx(rows, "id", "page_id", "page_version_id", "ordinal", "label", "destination_url", "destination_host")}`;
    }

    if (input.existing) {
      const [updated] = await tx<{ id: string }[]>`
        update public.pages
        set published_version_id = ${input.versionId}::uuid, updated_at = now()
        where id = ${input.pageId}::uuid
          and owner_id = ${input.ownerId}::uuid
          and deleted_at is null
          and status in ('published', 'paused')
        returning id
      `;
      if (!updated) throw new PublishError(404, "not_found", {}, "Page not found.");
      await tx`select public.record_page_edit(${input.ownerId}::uuid, ${input.pageId}::uuid)`;
    } else {
      await tx`
        update public.pages
        set status = 'published', published_version_id = ${input.versionId}::uuid,
            published_at = now(), updated_at = now(), last_edited_at = now()
        where id = ${input.pageId}::uuid and owner_id = ${input.ownerId}::uuid
      `;
    }

    if (input.original.storage === "storage") {
      const [consumed] = await tx<{ id: string }[]>`
        update public.upload_reservations
        set consumed_at = now()
        where id = ${input.original.reservationId}::uuid
          and owner_id = ${input.ownerId}::uuid
          and consumed_at is null
          and expires_at > now()
        returning id
      `;
      if (!consumed) throw new PublishError(409, "expired", {}, "The upload took too long. Please try again.");
    }
  });

  return {
    page: { id: input.pageId, slug, title: input.existing?.title ?? input.title },
    warnings,
    missingImages: rewritten.missing,
    usedImagePaths: used.map((image) => image.path),
    unusedImagePaths: unused.map((image) => image.path),
    previousVersion,
  };
}

/** Storage paths that could not be deleted are retried on the owner's next publish. */
export async function queueStorageCleanup(ownerId: string, bucket: string, paths: string[]) {
  if (!paths.length) return;
  const sql = getDatabase();
  const rows = paths.map((path) => ({ owner_id: ownerId, bucket, path }));
  await sql`
    insert into public.storage_cleanup_queue ${sql(rows, "owner_id", "bucket", "path")}
    on conflict (bucket, path) do update set attempts = public.storage_cleanup_queue.attempts + 1, updated_at = now()
  `;
}

export async function takeStorageCleanup(ownerId: string, limit = 50) {
  const sql = getDatabase();
  return sql<{ id: string; bucket: string; path: string }[]>`
    select id, bucket, path
    from public.storage_cleanup_queue
    where owner_id = ${ownerId}::uuid and attempts < 10
    order by created_at
    limit ${limit}
  `;
}

export async function finishStorageCleanup(ids: string[]) {
  if (!ids.length) return;
  const sql = getDatabase();
  await sql`delete from public.storage_cleanup_queue where id in ${sql(ids)}`;
}
