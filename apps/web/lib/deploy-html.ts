import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/database";
import { ApiError } from "@/lib/api-http";
import { getPublisherUrl } from "@/lib/env";
import { prepareOriginalPublishedHtml, SANITIZER_VERSION } from "@/lib/html-sanitizer";
import { validateDeploymentInput } from "@/lib/deployment-input";
import { publicationUrls } from "@/lib/publication-url";

export async function deployHtml(ownerId: string, input: unknown) {
  const fields = validateDeploymentInput(input);
  const id = randomUUID(), versionId = randomUUID(), reservationId = randomUUID();
  const slug = `page-${randomBytes(8).toString("hex")}`;
  const urls = publicationUrls(slug, getPublisherUrl(), process.env.TAGWORKS_PUBLISHING_DOMAIN);
  const sourcePath = `${ownerId}/${id}/${versionId}/original.html`;
  const published = prepareOriginalPublishedHtml(fields.html, { fallbackTitle: fields.title, versionId });
  const sql = getDatabase();
  await sql.begin(async transaction => {
    const tx = transaction as unknown as typeof sql;
    const [quota] = await tx<{ allowed: boolean }[]>`select * from public.reserve_upload_quota(${ownerId}::uuid, ${reservationId}::uuid, ${sourcePath})`;
    if (!quota?.allowed) throw new ApiError(402, "Your upload allowance is used up. Choose a plan to continue.");
    await tx`insert into public.pages(id,owner_id,slug,title,description,status)
      values(${id}::uuid,${ownerId}::uuid,${slug},${fields.title},${fields.description},'draft')`;
    await tx`insert into public.page_versions(id,page_id,source_object_path,source_sha256,source_bytes,sanitized_html,sanitizer_version,warnings,source_storage,original_html)
      values(${versionId}::uuid,${id}::uuid,${sourcePath},${createHash("sha256").update(fields.html).digest("hex")},${Buffer.byteLength(fields.html)},${published.html},${SANITIZER_VERSION},${tx.json(published.warnings)},'database',${fields.html})`;
    if (published.outboundLinks.length) {
      const rows = published.outboundLinks.map(link => ({ id: link.id, page_id: id, page_version_id: versionId, ordinal: link.ordinal, label: link.label, destination_url: link.destinationUrl, destination_host: link.destinationHost }));
      await tx`insert into public.page_links ${tx(rows,"id","page_id","page_version_id","ordinal","label","destination_url","destination_host")}`;
    }
    await tx`update public.pages set status='published', published_version_id=${versionId}::uuid, published_at=now(), updated_at=now() where id=${id}::uuid and owner_id=${ownerId}::uuid`;
    const [consumed] = await tx<{ ok: boolean }[]>`select public.consume_upload_quota(${ownerId}::uuid,${reservationId}::uuid) as ok`;
    if (!consumed?.ok) throw new ApiError(409, "Deployment reservation expired. Retry the deployment.");
  });
  return { page: { id, slug, title: fields.title }, ...urls, warnings: published.warnings };
}
