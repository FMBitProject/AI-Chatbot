import { sopTidakKetemu } from "@/content/blog/kenapa-karyawan-tidak-menemukan-sop";
import { apaItuRag } from "@/content/blog/apa-itu-rag-dan-bedanya-dengan-chatgpt";
import { sopRumahSakit } from "@/content/blog/sop-dan-clinical-pathway-rumah-sakit";

// The blog's registry — the same shape as INDUSTRIES in industries.ts, for the
// same reason: one list is what stops a post from existing as a page while being
// invisible to the index, the sitemap, or the other way round.
//
// Posts are TypeScript modules, not .md files read from disk at build time. The
// filesystem route is the obvious one and it is a trap here: Vercel's output
// tracing only bundles files it can see referenced statically, and a
// `readFileSync(path.join(process.cwd(), "content", slug + ".md"))` is by
// definition not static. That builds locally and 500s in production on every
// post. An import cannot fail that way — a missing post is a compile error.
export type BlogPost = {
  slug: string;
  title: string;
  // The <title> tag, when the on-page headline is too long to survive a search
  // result. Google renders roughly 60 characters, and a headline written to read
  // well above an article is regularly longer than that.
  //
  // Rendered through `title.absolute`, so the root layout's
  // "%s — IntelliBase AI" template is deliberately skipped on posts: the suffix
  // costs 17 of those characters to repeat a brand name nobody is searching for
  // yet. The keyword earns the space instead.
  metaTitle?: string;
  // Written for a search result, not for the page: this is what Google prints
  // under the blue link, so it has to make sense with no article around it.
  // ~155 characters before it gets truncated.
  description: string;
  // The one-line hook on the index card. Separate from `description` because the
  // index has the title sitting right above it, while a search result does not —
  // repeating the title's words there wastes the only two lines we get.
  excerpt: string;
  // ISO date. Sorted on, and printed as the byline, so it is the real publish
  // date rather than the file's mtime.
  publishedAt: string;
  // Minutes. Stated rather than computed from word count: these are Indonesian
  // articles with tables and lists, where the usual 200-words-per-minute divisor
  // is wrong by enough to look careless.
  readingMinutes: number;
  // A vertical's route (`/solusi/rumah-sakit`) when the post has one. The
  // article footer turns it into the next step, which is the whole point of
  // writing a post aimed at one industry.
  relatedHref?: string;
  relatedLabel?: string;
  // Markdown. Rendered on the server (see src/components/blog/Markdown.tsx), so
  // none of the parser reaches the browser.
  body: string;
};

// Newest first is the order the index renders and the order `previousPost`
// walks, so it is applied once here rather than at each call site.
export const POSTS: BlogPost[] = [sopTidakKetemu, apaItuRag, sopRumahSakit].sort(
  (a, b) => b.publishedAt.localeCompare(a.publishedAt),
);

export function getPost(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}

/**
 * The post published just before this one, or undefined for the oldest.
 *
 * A dead end at the bottom of an article is the most expensive part of a blog
 * nobody reads: a visitor who arrived from a search result has no reason to
 * believe there is a second page unless this one names it.
 */
export function previousPost(slug: string): BlogPost | undefined {
  const i = POSTS.findIndex((p) => p.slug === slug);
  return i === -1 ? undefined : POSTS[i + 1];
}

/** "8 Agustus 2026" — the byline format, Indonesian like the rest of the copy. */
export function formatPostDate(iso: string): string {
  // Explicit UTC. The date is a plain "YYYY-MM-DD", which JS parses as midnight
  // UTC; formatting that in a timezone behind UTC rolls it back a day, so a post
  // published on the 8th renders as the 7th for anyone west of London.
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
