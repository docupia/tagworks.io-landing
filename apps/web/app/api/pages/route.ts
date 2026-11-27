import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getAccountPlan } from "@/lib/account-plan";
import { getDatabase } from "@/lib/database";
import { getPublisherUrl } from "@/lib/env";
import { LOCALE_COOKIE, normalizeLocale, text } from "@/lib/i18n";
import { PAGE_ID_PATTERN } from "@/lib/page-revisions";
import {
  IMAGE_BUCKET,
  listVersionImages,
  ORIGINAL_BUCKET,
  removeOrQueue,
  runQueuedCleanup,
  versionPrefix,
} from "@/lib/page-storage";
import { publicationUrls } from "@/lib/publication-url";
import { getPublicUsername } from "@/lib/public-username";
import {
  checkImageLimits,
  checkPublishAllowed,
  commitPublish,
  decodeHtml,
  PublishError,
  type StoredImage,
} from "@/lib/publish-page";
import { publishErrorResponse, RequestError } from "@/lib/publish-response";
import { isSameOriginMutation } from "@/lib/request-security";
import { createClient } from "@/lib/supabase/server";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/upload-images";
import { validateUploadFields } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedTypes = new Set(["", "text/html", "application/xhtml+xml"]);
// HTML plus form fields; images go straight to storage.
const maxRequestBytes = 2 * 1024 * 1024 + 256 * 1024;

export function POST(request: NextRequest) {
  return publish(request, false);
}

export function PATCH(request: NextRequest) {
  return publish(request, true);
}

function parseManifest(value: FormDataEntryValue | null, prefix: string) {
  if (value === null || value === "") return [];
  if (typeof value !== "string" || value.length > 200_000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const entries: Array<{ name: string; path: string }> = [];
  for (const item of parsed) {
    const { name, path } = (item ?? {}) as Record<string, unknown>;
    if (typeof name !== "string" || typeof path !== "string") return null;
    if (!path.startsWith(`${prefix}/`) || path.slice(prefix.length + 1).includes("/")) return null;
    entries.push({ name, path });
  }
  return entries;
}

async function publish(request: NextRequest, edit: boolean) {
  const locale = normalizeLocale(request.cookies.get(LOCALE_COOKIE)?.value);
  const tx = (english: string, korean: string) => text(locale, english, korean);
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  let ownerId: string | null = null;
  let prefix: string | null = null;
  let originalPath: string | null = null;
  let committed = false;

  try {
    if (!isSameOriginMutation(request)) throw new RequestError(tx("This request is not allowed.", "허용되지 않은 요청입니다."), 403);
    if (Number(request.headers.get("content-length") ?? "0") > maxRequestBytes) {
      throw new RequestError(tx("The upload is too large.", "전체 업로드 용량이 너무 큽니다."), 413);
    }

    supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new RequestError(tx("Log in to continue.", "로그인이 필요합니다."), 401);
    ownerId = user.id;
    await runQueuedCleanup(supabase, user.id);

    const formData = await request.formData();
    const pageField = formData.get("pageId");
    const versionField = formData.get("versionId");
    const targetId = edit ? pageField : (pageField || randomUUID());
    const versionId = versionField || randomUUID();
    if (typeof targetId !== "string" || !PAGE_ID_PATTERN.test(targetId)
      || typeof versionId !== "string" || !PAGE_ID_PATTERN.test(versionId)) {
      throw new RequestError(tx("Choose a valid page.", "올바른 페이지를 선택해 주세요."), 400);
    }

    const account = await getAccountPlan(user.id);
    const existing = await checkPublishAllowed(account, user.id, edit ? targetId : undefined);
    let fields: { title: string; description: string | null };
    if (existing) {
      fields = { title: existing.title, description: null };
    } else {
      try {
        fields = validateUploadFields(formData);
      } catch {
        throw new RequestError(tx("Enter a title of up to 100 characters and a description of up to 300.", "제목은 100자, 설명은 300자 이내로 입력해 주세요."), 400);
      }
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new RequestError(tx("Choose an HTML file.", "HTML 파일을 선택해 주세요."), 400);
    }
    if (!/\.html?$/i.test(file.name) || !allowedTypes.has(file.type.toLowerCase())) {
      throw new RequestError(tx("Only .html or .htm files can be uploaded.", ".html 또는 .htm 파일만 업로드할 수 있습니다."), 415);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const source = decodeHtml(bytes, account, file.name);

    // Images were uploaded by the browser under this version's prefix.
    // Their real sizes come from storage, not from the request.
    prefix = versionPrefix(user.id, targetId, versionId);
    const manifest = parseManifest(formData.get("images"), prefix);
    if (!manifest) throw new RequestError(tx("Choose valid images.", "올바른 이미지를 선택해 주세요."), 400);
    const stored = manifest.length ? await listVersionImages(supabase, prefix) : [];
    const storedByPath = new Map(stored.map((object) => [object.path, object]));
    const imageBucket = supabase.storage.from(IMAGE_BUCKET);
    const images: StoredImage[] = [];
    for (const entry of manifest) {
      const object = storedByPath.get(entry.path);
      if (!object) throw new RequestError(tx("An image upload did not finish. Please try again.", "이미지 업로드가 끝나지 않았습니다. 다시 시도해 주세요."), 409);
      if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(object.contentType)) {
        throw new PublishError(415, "image_type", { file: entry.name });
      }
      images.push({ name: entry.name, path: entry.path, bytes: object.bytes, url: imageBucket.getPublicUrl(entry.path).data.publicUrl });
    }
    checkImageLimits(account, bytes.byteLength, images);

    // The private original is kept for support and future re-processing.
    originalPath = `${user.id}/${targetId}/${versionId}/original.html`;
    const reservationId = randomUUID();
    await getDatabase()`
      insert into public.upload_reservations (id, owner_id, object_path)
      values (${reservationId}::uuid, ${user.id}::uuid, ${originalPath})
    `;
    const { error: uploadError } = await supabase.storage.from(ORIGINAL_BUCKET).upload(originalPath, bytes, {
      cacheControl: "3600",
      contentType: "text/html",
      upsert: false,
    });
    if (uploadError) throw new RequestError(tx("Could not store the original file safely.", "원본 파일을 안전하게 보관하지 못했습니다."), 503);

    const result = await commitPublish({
      ownerId: user.id,
      account,
      existing,
      pageId: targetId,
      versionId,
      title: fields.title,
      description: fields.description,
      source,
      sourceBytes: bytes.byteLength,
      images,
      original: { storage: "storage", path: originalPath, reservationId },
    });
    committed = true;

    // Unused uploads are not kept. After an edit the page already shows the
    // new version, so the previous version's files can go.
    await removeOrQueue(supabase, user.id, IMAGE_BUCKET, [
      ...result.unusedImagePaths,
      ...(result.previousVersion?.imagePaths ?? []),
    ]);
    if (result.previousVersion?.sourcePath) {
      await removeOrQueue(supabase, user.id, ORIGINAL_BUCKET, [result.previousVersion.sourcePath]);
    }

    const { publicUrl } = publicationUrls(result.page.slug, getPublisherUrl(), process.env.TAGWORKS_PUBLISHING_DOMAIN, await getPublicUsername(user.id));
    return NextResponse.json(
      { page: result.page, publicUrl, warnings: result.warnings, missingImages: result.missingImages },
      { status: edit ? 200 : 201 },
    );
  } catch (reason) {
    if (!committed && supabase && ownerId && prefix) {
      // A failed publish leaves the live page on its previous version.
      try {
        const leftovers = await listVersionImages(supabase, prefix);
        await removeOrQueue(supabase, ownerId, IMAGE_BUCKET, leftovers.map((object) => object.path));
      } catch {
        // Nothing was uploaded, or the listing failed; the queue is not needed.
      }
      if (originalPath) await removeOrQueue(supabase, ownerId, ORIGINAL_BUCKET, [originalPath]);
    }
    return publishErrorResponse(reason, locale);
  }
}
