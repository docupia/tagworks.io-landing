import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { releaseUploadQuota, reserveUploadQuota } from "@/lib/billing";
import { getDatabase } from "@/lib/database";
import { getPublisherUrl } from "@/lib/env";
import {
  MAX_HTML_BYTES,
  SANITIZER_VERSION,
  prepareOriginalPublishedHtml,
} from "@/lib/html-sanitizer";
import { isSameOriginMutation } from "@/lib/request-security";
import { createClient } from "@/lib/supabase/server";
import { validateUploadFields } from "@/lib/validation";
import { LOCALE_COOKIE, normalizeLocale, text, type Locale } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const allowedTypes = new Set(["", "text/html", "application/xhtml+xml"]);
const maxMultipartBytes = MAX_HTML_BYTES + 128 * 1024;

function errorResponse(reason: unknown, locale: Locale) {
  if (reason instanceof RequestError) {
    return NextResponse.json({ error: reason.message }, { status: reason.status });
  }

  console.error("Page publishing failed", reason instanceof Error ? reason.message : "unknown error");
  return NextResponse.json(
    { error: text(locale, "Could not publish the page. Please try again shortly.", "페이지를 게시하지 못했습니다. 잠시 후 다시 시도해 주세요.") },
    { status: 500 },
  );
}

export async function POST(request: NextRequest) {
  const locale = normalizeLocale(request.cookies.get(LOCALE_COOKIE)?.value);
  const tr = (english: string, korean: string) => text(locale, english, korean);
  let objectPath: string | null = null;
  let reservationId: string | null = null;
  let ownerId: string | null = null;
  let storageClient: Awaited<ReturnType<typeof createClient>> | null = null;

  try {
    if (!isSameOriginMutation(request)) {
      throw new RequestError(tr("This request is not allowed.", "허용되지 않은 요청입니다."), 403);
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > maxMultipartBytes) {
      throw new RequestError(tr("HTML files must be 1 MiB or smaller.", "HTML 파일은 1MiB 이하만 업로드할 수 있습니다."), 413);
    }

    const supabase = await createClient();
    storageClient = supabase;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new RequestError(tr("Log in to continue.", "로그인이 필요합니다."), 401);
    ownerId = user.id;

    const formData = await request.formData();
    const fields = validateUploadFields(formData);
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new RequestError(tr("Choose an HTML file.", "HTML 파일을 선택해 주세요."), 400);
    }
    if (file.size > MAX_HTML_BYTES) {
      throw new RequestError(tr("HTML files must be 1 MiB or smaller.", "HTML 파일은 1MiB 이하만 업로드할 수 있습니다."), 413);
    }
    if (!/\.html?$/i.test(file.name) || !allowedTypes.has(file.type.toLowerCase())) {
      throw new RequestError(tr("Only .html or .htm files can be uploaded.", ".html 또는 .htm 파일만 업로드할 수 있습니다."), 415);
    }

    const pageId = randomUUID();
    const versionId = randomUUID();
    reservationId = randomUUID();
    const slug = `page-${randomBytes(6).toString("hex")}`;
    objectPath = `${user.id}/${pageId}/${versionId}/original.html`;

    const sql = getDatabase();
    const expiredReservations = await sql<{ object_path: string }[]>`
      select object_path
      from public.upload_reservations
      where owner_id = ${user.id}::uuid
        and consumed_at is null
        and expires_at <= now()
      order by expires_at asc
      limit 20
    `;
    if (expiredReservations.length) {
      const { error: cleanupError } = await supabase.storage
        .from("page-originals")
        .remove(expiredReservations.map((reservation) => reservation.object_path));
      if (!cleanupError) {
        const expiredPaths = expiredReservations.map(
          (reservation) => reservation.object_path,
        );
        await sql`
          delete from public.upload_reservations
          where owner_id = ${user.id}::uuid
            and object_path in ${sql(expiredPaths)}
        `;
      }
    }

    const quota = await reserveUploadQuota(user.id, reservationId, objectPath);
    if (!quota.allowed) {
      throw new RequestError(
        tr(
          "Your upload allowance is used up. Choose a plan to continue.",
          "업로드 이용량을 모두 사용했습니다. 계속하려면 플랜을 선택해 주세요.",
        ),
        402,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    } catch {
      throw new RequestError(tr("Only UTF-8 encoded HTML files can be uploaded.", "UTF-8로 저장된 HTML 파일만 업로드할 수 있습니다."), 400);
    }
    if (source.includes("\0") || !/<[a-z!][^>]*>/i.test(source)) {
      throw new RequestError(tr("Choose a valid HTML document.", "올바른 HTML 문서를 선택해 주세요."), 400);
    }

    const published = prepareOriginalPublishedHtml(source, {
      fallbackTitle: fields.title,
      versionId,
    });

    const { error: uploadError } = await supabase.storage
      .from("page-originals")
      .upload(objectPath, bytes, {
        cacheControl: "3600",
        contentType: "text/html",
        upsert: false,
      });
    if (uploadError) throw new RequestError(tr("Could not store the original file safely.", "원본 파일을 안전하게 보관하지 못했습니다."), 503);

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await sql.begin(async (transaction) => {
      const tx = transaction as unknown as typeof sql;

      await tx`
        insert into public.pages (
          id, owner_id, slug, title, description, status
        ) values (
          ${pageId}::uuid,
          ${user.id}::uuid,
          ${slug},
          ${fields.title},
          ${fields.description},
          'draft'
        )
      `;
      await tx`
        insert into public.page_versions (
          id,
          page_id,
          source_object_path,
          source_sha256,
          source_bytes,
          sanitized_html,
          sanitizer_version,
          warnings
        ) values (
          ${versionId}::uuid,
          ${pageId}::uuid,
          ${objectPath},
          ${sha256},
          ${bytes.byteLength},
          ${published.html},
          ${SANITIZER_VERSION},
          ${tx.json(published.warnings)}
        )
      `;
      if (published.outboundLinks.length) {
        const linkRows = published.outboundLinks.map((link) => ({
          id: link.id,
          page_id: pageId,
          page_version_id: versionId,
          ordinal: link.ordinal,
          label: link.label,
          destination_url: link.destinationUrl,
          destination_host: link.destinationHost,
        }));
        await tx`
          insert into public.page_links ${tx(
            linkRows,
            "id",
            "page_id",
            "page_version_id",
            "ordinal",
            "label",
            "destination_url",
            "destination_host",
          )}
        `;
      }
      await tx`
        update public.pages
        set status = 'published',
            published_version_id = ${versionId}::uuid,
            published_at = now(),
            updated_at = now()
        where id = ${pageId}::uuid
          and owner_id = ${user.id}::uuid
      `;
      const [consumption] = await tx<{ consumed: boolean }[]>`
        select public.consume_upload_quota(
          ${user.id}::uuid,
          ${reservationId}::uuid
        ) as consumed
      `;
      if (!consumption?.consumed) {
        throw new RequestError(
          tr("The upload took too long. Please try again.", "업로드 시간이 초과되었습니다. 다시 시도해 주세요."),
          409,
        );
      }
    });

    return NextResponse.json(
      {
        page: { id: pageId, slug, title: fields.title },
        publicUrl: `${getPublisherUrl()}/p/${slug}`,
        warnings: published.warnings,
      },
      { status: 201 },
    );
  } catch (reason) {
    if (objectPath && storageClient) {
      await storageClient.storage.from("page-originals").remove([objectPath]);
    }
    if (reservationId && ownerId) {
      try {
        await releaseUploadQuota(ownerId, reservationId);
      } catch {
        // The reservation expires and is released by the next quota check.
      }
    }
    return errorResponse(reason, locale);
  }
}
