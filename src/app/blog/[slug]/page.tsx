import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BlogShell } from "@/components/blog/BlogShell";
import { ArticleBody } from "@/components/blog/ArticleBody";
import { Button } from "@/components/ui/button";
import { POSTS, getPost, previousPost, formatPostDate } from "@/lib/blog";

type Params = { params: Promise<{ slug: string }> };

// Every post is prerendered at build time. The set is a compile-time constant,
// so there is nothing to fetch and no reason for a reader to ever wait on a
// render — which also means a crawler is served static HTML on first hit.
export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }));
}

// Anything not in that list is a 404 rather than a page rendered on demand.
// Without this, /blog/apa-saja renders at request time and — via `notFound()`
// below — still 404s, but only after a server round trip. Closing it here also
// means the route can never be used to probe for unpublished slugs.
export const dynamicParams = false;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  return {
    // `absolute` skips the root layout's "%s — IntelliBase AI" template on
    // purpose; see the note on `metaTitle` in src/lib/blog.ts.
    title: { absolute: post.metaTitle ?? post.title },
    description: post.description,
    // Still no per-page `openGraph`: it replaces the parent object instead of
    // merging into it, which is how five pages lost their og:image the last time
    // one was added here. An article that gets shared needs its card more than
    // most pages do.
    alternates: { canonical: `/blog/${post.slug}` },
  };
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const post = getPost(slug);
  // Unreachable while `dynamicParams` is false, but it is what narrows `post`
  // from `BlogPost | undefined` — and the safety net if that flag ever flips.
  if (!post) notFound();

  const previous = previousPost(post.slug);

  return (
    <BlogShell>
      <article className="max-w-3xl mx-auto px-6 pt-10 pb-16">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Semua tulisan
        </Link>

        <header className="mb-10">
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
            <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
            <span aria-hidden="true">·</span>
            <span>{post.readingMinutes} menit baca</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-gray-900 leading-tight mb-4">
            {post.title}
          </h1>
          <p className="text-lg text-gray-500 leading-relaxed">{post.excerpt}</p>
        </header>

        <ArticleBody>{post.body}</ArticleBody>

        {post.relatedHref && post.relatedLabel && (
          <div className="mt-12 pt-8 border-t border-hairline">
            <Link
              href={post.relatedHref}
              className="inline-flex items-center gap-1.5 font-medium text-teal-700 hover:text-teal-800 transition-colors"
            >
              {post.relatedLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </article>

      {/* The end of an article is where a reader who arrived from a search
          result decides whether this site is worth a second page. Both exits are
          offered: the product, and one more thing to read. */}
      <section className="bg-sunken border-t border-hairline py-14 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl md:text-2xl font-semibold tracking-[-0.01em] text-gray-900 mb-3">
            Coba dengan dokumen Anda sendiri
          </h2>
          <p className="text-gray-500 leading-relaxed mb-6 max-w-xl">
            Unggah beberapa SOP, lalu tanyakan hal yang biasanya ditanyakan staf.
            Paket gratisnya tidak meminta kartu kredit.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/register">
              <Button className="bg-teal-600 hover:bg-teal-700 gap-2 w-full sm:w-auto">
                Mulai Gratis <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" className="w-full sm:w-auto">Lihat Paket Harga</Button>
            </Link>
          </div>

          {previous && (
            <div className="mt-10 pt-8 border-t border-hairline">
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Tulisan sebelumnya</p>
              <Link
                href={`/blog/${previous.slug}`}
                className="group inline-flex items-start gap-1.5 font-medium text-gray-900 hover:text-teal-700 transition-colors"
              >
                {previous.title}
                <ArrowRight className="h-4 w-4 mt-1 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}
        </div>
      </section>
    </BlogShell>
  );
}
