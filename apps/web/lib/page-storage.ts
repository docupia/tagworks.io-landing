import type { SupabaseClient } from "@supabase/supabase-js";
import { finishStorageCleanup, queueStorageCleanup, takeStorageCleanup } from "@/lib/publish-page";

export const IMAGE_BUCKET = "page-images";
export const ORIGINAL_BUCKET = "page-originals";

/** Images for one version live under this prefix. */
export const versionPrefix = (ownerId: string, pageId: string, versionId: string) =>
  `${ownerId}/${pageId}/${versionId}`;

export type StoredObject = { path: string; bytes: number; contentType: string };

/** Lists the images actually stored for a version, with their real sizes. */
export async function listVersionImages(
  supabase: SupabaseClient,
  prefix: string,
): Promise<StoredObject[]> {
  const { data, error } = await supabase.storage.from(IMAGE_BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;
  return (data ?? [])
    .filter((item) => item.id && item.metadata)
    .map((item) => ({
      path: `${prefix}/${item.name}`,
      bytes: Number(item.metadata?.size ?? 0),
      contentType: String(item.metadata?.mimetype ?? ""),
    }));
}

/** Deletes storage objects; anything that fails is queued for a later retry. */
export async function removeOrQueue(
  supabase: SupabaseClient,
  ownerId: string,
  bucket: string,
  paths: string[],
) {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) {
    try {
      await queueStorageCleanup(ownerId, bucket, paths);
    } catch (reason) {
      console.error("Could not queue storage cleanup", reason instanceof Error ? reason.message : "unknown error");
    }
  }
}

/** Retries queued deletes for this owner. Never throws. */
export async function runQueuedCleanup(supabase: SupabaseClient, ownerId: string) {
  try {
    const items = await takeStorageCleanup(ownerId);
    if (!items.length) return;
    const done: string[] = [];
    for (const bucket of new Set(items.map((item) => item.bucket))) {
      const batch = items.filter((item) => item.bucket === bucket);
      const { error } = await supabase.storage.from(bucket).remove(batch.map((item) => item.path));
      if (!error) done.push(...batch.map((item) => item.id));
      else await queueStorageCleanup(ownerId, bucket, batch.map((item) => item.path));
    }
    await finishStorageCleanup(done);
  } catch (reason) {
    console.error("Queued storage cleanup failed", reason instanceof Error ? reason.message : "unknown error");
  }
}
