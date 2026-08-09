import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BlogShell } from "@/components/blog/BlogShell";
import { POSTS, formatPostDate } from "@/lib/blog";

export const metadata: Metadata = {
  // No "— IntelliBase AI" suffix: the root layout's `title.template` appends it
  // to every child segment already, and spelling it out here renders it twice.
  title: "Blog",
  description:
    "Tulisan tentang dokumen internal perusahaan, SOP yang tidak pernah dibaca, dan cara kerja AI yang menjawab dari dokumen Anda sendiri.",
  // No `openGraph` key. Nested metadata objects replace rather than merge, so
  // declaring one here — even just to add a title — drops the root layout's
  // og:image, site_name and locale, and the shared link loses its card. This
  // already happened once across five pages. `alternates` merges cleanly.
  alternates: { canonical: "/blog" },
};

export default function BlogIndexPage() {
  return (
    <BlogShell>
      <section className="max-w-3xl mx-auto px-6 pt-14 pb-8">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-gray-900 mb-4">
          Blog
        </h1>
        <p className="text-gray-500 text-lg leading-relaxed">
          Catatan tentang dokumen internal perusahaan: kenapa SOP yang sudah rapi
          tetap tidak ditemukan, bagaimana AI bisa menjawab dari dokumen Anda
          sendiri, dan di mana batasnya.
        </p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-20">
        <ul className="divide-y divide-hairline border-t border-hairline">
          {POSTS.map((post) => (
            <li key={post.slug}>
              {/* The whole row is the link, not just the title: a card with a
                  small tappable target inside it is the most common way a list
                  like this ends up feeling broken on a phone. */}
              <Link
                href={`/blog/${post.slug}`}
                className="group block py-8 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-4"
              >
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                  {/* dateTime carries the machine-readable value; the visible
                      text is the Indonesian long form. */}
                  <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
                  <span aria-hidden="true">·</span>
                  <span>{post.readingMinutes} menit baca</span>
                </div>
                <h2 className="text-xl md:text-2xl font-semibold tracking-[-0.01em] text-gray-900 mb-2 group-hover:text-teal-700 transition-colors">
                  {post.title}
                </h2>
                <p className="text-gray-500 leading-relaxed mb-3">{post.excerpt}</p>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700">
                  Baca selengkapnya
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </BlogShell>
  );
}
