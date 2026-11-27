import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { BLOG_POSTS } from "../lib/blog-posts";
import { blogPostJsonLd, jsonLd, relatedPosts } from "../lib/blog";

const sitemap = readFileSync(join(__dirname, "..", "app", "sitemap.xml"), "utf8");

test("blog posts have unique, URL-safe slugs and complete metadata", () => {
  const slugs = BLOG_POSTS.map((post) => post.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const post of BLOG_POSTS) {
    assert.match(post.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    for (const field of [post.title, post.description, post.h1, post.lead, post.short, post.card, post.tag, post.body]) {
      assert.ok(field.trim().length > 0, `${post.slug} has an empty field`);
    }
    assert.ok(post.description.length <= 170, `${post.slug} description is too long for search results`);
    assert.doesNotMatch(post.body, /<script|on\w+=/i, `${post.slug} body must stay plain HTML`);
  }
});

test("sitemap.xml lists the blog and every post", () => {
  assert.ok(sitemap.includes("<loc>https://tagworks.io/blog</loc>"));
  for (const post of BLOG_POSTS) {
    assert.ok(sitemap.includes(`<loc>https://tagworks.io/blog/${post.slug}</loc>`), `${post.slug} is missing from sitemap.xml`);
  }
});

test("related guides never include the current post", () => {
  for (const post of BLOG_POSTS) {
    const related = relatedPosts(post);
    assert.equal(related.length, Math.min(3, BLOG_POSTS.length - 1));
    assert.ok(related.every((item) => item.slug !== post.slug));
  }
});

test("JSON-LD is safe to embed in a script tag", () => {
  const serialized = jsonLd(blogPostJsonLd({ ...BLOG_POSTS[0], faq: [["</script><b>", "x"]] }));
  assert.doesNotMatch(serialized, /<\/script/i);
});

test("every guide links to the home page early in the body", () => {
  for (const post of BLOG_POSTS) {
    const firstHeading = post.body.indexOf("<h2");
    const homeLink = post.body.search(/<a href="\/">[^<]*TagWorks[^<]*<\/a>/);
    assert.ok(homeLink >= 0 && homeLink < firstHeading, `${post.slug} needs a keyword link to / before its first heading`);
  }
});

test("FAQPage JSON-LD covers every visible FAQ item", () => {
  for (const post of BLOG_POSTS) {
    assert.ok(post.faq.length >= 3, `${post.slug} should have at least 3 FAQ items`);
    const faqPage = (blogPostJsonLd(post) as { "@type": string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] }[])
      .find((item) => item["@type"] === "FAQPage");
    assert.ok(faqPage?.mainEntity, `${post.slug} is missing FAQPage`);
    assert.deepEqual(faqPage.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]), post.faq);
  }
});
