export function publicationSlug(host: string, domain: string | undefined): string | null {
  if (!domain) return null;
  const hostname = host.toLowerCase().split(":")[0];
  const suffix = `.${domain.toLowerCase()}`;
  if (!hostname.endsWith(suffix)) return null;
  const slug = hostname.slice(0, -suffix.length);
  return /^page-[a-f0-9]{16}$/.test(slug) ? slug : null;
}
