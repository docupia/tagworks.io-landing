import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDatabase } from "@/lib/database";
import { getPublisherUrl } from "@/lib/env";
import {
  MAX_HTML_BYTES,
  SANITIZER_VERSION,
  sanitizePublishedHtml,
} from "@/lib/html-sanitizer";
import { isSameOriginMutation } from "@/lib/request-security";
import { createClient } from "@/lib/supabase/server";
import { validateUploadFields } from "@/lib/validation";

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

function errorResponse(reason: unknown) {
  if (reason instanceof RequestError) {
    return NextResponse.json({ error: reason.message }, { status: reason.status });
  }

  console.error("Page publishing failed", reason instanceof Error ? reason.message : "unknown error");
  return NextResponse.json(
    { error: "페이지를 게시하지 못했습니다. 잠시 후 다시 시도해 주세요." },
    { status: 500 },
  );
}

export async function POST(request: NextRequest) {
  let objectPath: string | null = null;
  let storageClient: Awaited<ReturnType<typeof createClient>> | null = null;

  try {
    if (!isSameOriginMutation(request)) {
      throw new RequestError("허용되지 않은 요청입니다.", 403);
    }

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > maxMultipartBytes) {
      throw new RequestError("HTML 파일은 1MiB 이하만 업로드할 수 있습니다.", 413);
    }

    const supabase = await createClient();
    storageClient = supabase;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new RequestError("로그인이 필요합니다.", 401);

    const formData = await request.formData();
    const fields = validateUploadFields(formData);
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new RequestError("HTML 파일을 선택해 주세요.", 400);
    }
    if (file.size > MAX_HTML_BYTES) {
      throw new RequestError("HTML 파일은 1MiB 이하만 업로드할 수 있습니다.", 413);
    }
    if (!/\.html?$/i.test(file.name) || !allowedTypes.has(file.type.toLowerCase())) {
      throw new RequestError(".html 또는 .htm 파일만 업로드할 수 있습니다.", 415);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    } catch {
      throw new RequestError("UTF-8로 저장된 HTML 파일만 업로드할 수 있습니다.", 400);
    }
    if (source.includes("\0") || !/<[a-z!][^>]*>/i.test(source)) {
      throw new RequestError("올바른 HTML 문서를 선택해 주세요.", 400);
    }

    const sanitized = sanitizePublishedHtml(source);
    if (!sanitized.html) {
      throw new RequestError("안전 검사 후 게시할 수 있는 내용이 남지 않았습니다.", 422);
    }

    const pageId = randomUUID();
    const versionId = randomUUID();
    const slug = `page-${randomBytes(6).toString("hex")}`;
    objectPath = `${user.id}/${pageId}/${versionId}/original.html`;

    const { error: uploadError } = await supabase.storage
      .from("page-originals")
      .upload(objectPath, bytes, {
        cacheControl: "3600",
        contentType: "text/html",
        upsert: false,
      });
    if (uploadError) throw new RequestError("원본 파일을 안전하게 보관하지 못했습니다.", 503);

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const sql = getDatabase();
    await sql.begin(async (transaction) => {
      // postgres.js currently loses the callable signature from TransactionSql
      // under TypeScript 5.9; the runtime object is the same tagged SQL client.
      const tx = transaction as unknown as typeof sql;
      const [rate] = await tx<{ count: number }[]>`
        select count(*)::int as count
        from public.pages
        where owner_id = ${user.id}::uuid
          and created_at > now() - interval '1 hour'
      `;
      if ((rate?.count ?? 0) >= 20) {
        throw new RequestError("한 시간에 최대 20개까지 게시할 수 있습니다.", 429);
      }

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
          ${sanitized.html},
          ${SANITIZER_VERSION},
          ${tx.json(sanitized.warnings)}
        )
      `;
      await tx`
        update public.pages
        set status = 'published',
            published_version_id = ${versionId}::uuid,
            published_at = now(),
            updated_at = now()
        where id = ${pageId}::uuid
          and owner_id = ${user.id}::uuid
      `;
    });

    return NextResponse.json(
      {
        page: { id: pageId, slug, title: fields.title },
        publicUrl: `${getPublisherUrl()}/p/${slug}`,
        warnings: sanitized.warnings,
      },
      { status: 201 },
    );
  } catch (reason) {
    if (objectPath && storageClient) {
      await storageClient.storage.from("page-originals").remove([objectPath]);
    }
    return errorResponse(reason);
  }
}
