import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getAccountPlan } from "@/lib/account-plan";
import { LOCALE_COOKIE, normalizeLocale, text } from "@/lib/i18n";
import { IMAGE_BUCKET, versionPrefix } from "@/lib/page-storage";
import { PAGE_ID_PATTERN } from "@/lib/page-revisions";
import { checkImageLimits, checkPublishAllowed, PublishError } from "@/lib/publish-page";
import { publishErrorResponse, RequestError } from "@/lib/publish-response";
import { isSameOriginMutation } from "@/lib/request-security";
import { createClient } from "@/lib/supabase/server";
import { ACCEPTED_IMAGE_TYPES, storageImageName } from "@/lib/upload-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImageRequest = { name: string; size: number; originalSize: number; type: string };

function parseImages(value: unknown): ImageRequest[] | null {
  if (!Array.isArray(value) || value.length > 1000) return null;
  const images: ImageRequest[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { name, size, originalSize, type } = item as Record<string, unknown>;
    if (typeof name !== "string" || !name || name.length > 255 || name.includes("/")) return null;
    if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) return null;
    if (typeof originalSize !== "number" || !Number.isInteger(originalSize) || originalSize <= 0) return null;
    if (typeof type !== "string") return null;
    images.push({ name, size, originalSize, type });
  }
  return images;
}

/**
 * Step 1 of publishing: checks the plan and returns one signed upload URL
 * per image, scoped to this link and version. The browser then uploads the
 * optimized images straight to storage, so large files never pass through a
 * server function.
 */
export async function POST(request: NextRequest) {
  const locale = normalizeLocale(request.cookies.get(LOCALE_COOKIE)?.value);
  const tx = (english: string, korean: string) => text(locale, english, korean);
  try {
    if (!isSameOriginMutation(request)) throw new RequestError(tx("This request is not allowed.", "허용되지 않은 요청입니다."), 403);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new RequestError(tx("Log in to continue.", "로그인이 필요합니다."), 401);

    const body = await request.json().catch(() => null) as { pageId?: unknown; htmlBytes?: unknown; images?: unknown } | null;
    const images = parseImages(body?.images ?? []);
    if (!images) throw new RequestError(tx("Choose valid images.", "올바른 이미지를 선택해 주세요."), 400);
    if (new Set(images.map((image) => image.name)).size !== images.length) {
      throw new RequestError(tx("Image filenames must be unique.", "이미지 파일명이 서로 달라야 합니다."), 400);
    }
    const editId = body?.pageId;
    if (editId !== undefined && (typeof editId !== "string" || !PAGE_ID_PATTERN.test(editId))) {
      throw new RequestError(tx("Choose a valid page.", "올바른 페이지를 선택해 주세요."), 400);
    }
    const htmlBytes = typeof body?.htmlBytes === "number" && body.htmlBytes > 0 ? body.htmlBytes : 1;

    const account = await getAccountPlan(user.id);
    await checkPublishAllowed(account, user.id, editId);
    for (const image of images) {
      if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(image.type)) {
        throw new PublishError(415, "image_type", { file: image.name });
      }
    }
    checkImageLimits(account, htmlBytes, images.map((image) => ({
      name: image.name, bytes: image.size, originalBytes: image.originalSize,
    })));

    const pageId = editId ?? randomUUID();
    const versionId = randomUUID();
    const prefix = versionPrefix(user.id, pageId, versionId);
    const bucket = supabase.storage.from(IMAGE_BUCKET);
    const uploads = [];
    for (const [index, image] of images.entries()) {
      const path = `${prefix}/${storageImageName(index, image.name, image.type)}`;
      const { data, error } = await bucket.createSignedUploadUrl(path);
      if (error || !data) throw new RequestError(tx("Could not prepare the image upload.", "이미지 업로드를 준비하지 못했습니다."), 503);
      uploads.push({ name: image.name, path: data.path, token: data.token });
    }

    return NextResponse.json({ pageId, versionId, uploads }, { status: 201 });
  } catch (reason) {
    return publishErrorResponse(reason, locale);
  }
}
