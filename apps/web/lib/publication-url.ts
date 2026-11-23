export function publicationUrls(slug: string, publisherUrl: string, domain?: string, username?: string) {
  const pathUrl = `${publisherUrl.replace(/\/$/, "")}/p/${username ? encodeURIComponent(username) + "/" : ""}${slug}`;
  if (!domain) return { publicUrl: pathUrl, pathUrl, subdomainUrl: null };
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) throw new Error("Invalid publishing domain.");
  const subdomainUrl = `https://${slug}.${domain.toLowerCase()}`;
  return { publicUrl: username ? pathUrl : subdomainUrl, pathUrl, subdomainUrl };
}
