import { BLOG_POSTS, type BlogPost } from "./blog-posts";

export const SITE_URL = "https://tagworks.io";

export const BLOG_INDEX = {
  title: "Guides for publishing AI-made pages | TagWorks Blog",
  description:
    "Step-by-step guides for publishing pages made with Claude, ChatGPT, Gemini, Claude Code, Cursor, Lovable and v0 as permanent links with click tracking.",
};

export function blogUrl(slug?: string) {
  return slug ? `${SITE_URL}/blog/${slug}` : `${SITE_URL}/blog`;
}

/** Up to three other guides, starting after the current one so every post links to different guides. */
export function relatedPosts(post: BlogPost, count = 3) {
  const index = BLOG_POSTS.findIndex((item) => item.slug === post.slug);
  const others = [...BLOG_POSTS.slice(index + 1), ...BLOG_POSTS.slice(0, index)];
  return others.slice(0, count);
}

/** Serializes JSON-LD so it is safe inside a <script> tag. */
export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function blogIndexJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "TagWorks Blog",
    url: blogUrl(),
    blogPost: BLOG_POSTS.map((post) => ({ "@type": "BlogPosting", headline: post.h1, url: blogUrl(post.slug) })),
  };
}

export function blogPostJsonLd(post: BlogPost) {
  const organization = { "@type": "Organization", name: "TagWorks", url: SITE_URL };
  const items: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.h1,
      description: post.description,
      datePublished: post.published,
      dateModified: post.updated,
      mainEntityOfPage: blogUrl(post.slug),
      author: organization,
      publisher: organization,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: blogUrl() },
        { "@type": "ListItem", position: 3, name: post.short, item: blogUrl(post.slug) },
      ],
    },
  ];
  if (post.faq.length) {
    items.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: post.faq.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    });
  }
  return items;
}
