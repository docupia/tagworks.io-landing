export function publicationUrls(slug: string, publisherUrl: string, domain?: string) {
  const pathUrl = `${publisherUrl.replace(/\/$/, "")}/p/${slug}`;
  if (!domain) return { publicUrl: pathUrl, pathUrl, subdomainUrl: null };
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) throw new Error("Invalid publishing domain.");
  const subdomainUrl = `https://${slug}.${domain.toLowerCase()}`;
  return { publicUrl: subdomainUrl, pathUrl, subdomainUrl };
}
