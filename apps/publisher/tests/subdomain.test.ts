import assert from "node:assert/strict";
import test from "node:test";
import { publicationSlug } from "../lib/subdomain";
test("wildcard publication only accepts generated slugs on the exact configured domain", () => {
  assert.equal(publicationSlug("page-0123456789abcdef.pages.example.net", "pages.example.net"), "page-0123456789abcdef");
  for (const host of ["evil.pages.example.net", "page-0123456789abcdef.pages.example.net.evil.com", "x.page-0123456789abcdef.pages.example.net", "pages.example.net"]) assert.equal(publicationSlug(host, "pages.example.net"), null);
  assert.equal(publicationSlug("page-0123456789abcdef.pages.example.net", undefined), null);
});
