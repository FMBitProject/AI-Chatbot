import ReactMarkdown from "react-markdown";
import Link from "next/link";

// A Server Component on purpose. react-markdown carries no "use client", so
// rendering it here keeps the parser and the whole unified/remark chain on the
// server — the browser receives finished HTML. Putting this inside the client
// shell instead would ship a markdown parser to every reader to re-render text
// that never changes.
//
// No remark-gfm: it is not a dependency, so the article bodies stay on
// CommonMark (see the note in the content modules). Tables would silently
// render as literal pipes.
//
// Also no rehype-raw, which means raw HTML inside a post body is inert rather
// than injected. That is the safe default and it matches the CSP in
// next.config.ts, which has no place for inline markup smuggled through prose.
export function ArticleBody({ children }: { children: string }) {
  return (
    <div className="text-gray-700">
      <ReactMarkdown
        components={{
          // scroll-mt so an anchored heading is not hidden behind the sticky
          // navbar, which is the same height on every marketing page.
          h2: ({ children }) => (
            <h2 className="scroll-mt-20 text-xl md:text-2xl font-semibold tracking-[-0.01em] text-gray-900 mt-12 mb-4">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="scroll-mt-20 text-base md:text-lg font-semibold text-gray-900 mt-8 mb-3">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="mb-5 leading-[1.75]">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-5 space-y-2.5 marker:text-teal-600">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-5 space-y-2.5 marker:text-teal-600 marker:font-semibold">{children}</ol>,
          li: ({ children }) => <li className="leading-[1.7] pl-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-teal-500 bg-sunken rounded-r-lg pl-5 pr-4 py-3 my-6 text-gray-600">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-10 border-hairline" />,
          code: ({ children }) => (
            <code className="font-mono text-[0.9em] bg-sunken border border-hairline rounded px-1.5 py-0.5">
              {children}
            </code>
          ),
          // Three kinds of link, and only one of them should open a tab.
          //
          // A route ("/pricing") goes through next/link for a client navigation
          // instead of a full reload. An in-page anchor ("#batas") and a
          // non-web scheme (mailto:, tel:) stay in this tab as plain anchors —
          // an earlier version treated everything without a leading slash as
          // external, which meant a link to a heading on this very page opened
          // a second tab. Only http(s) actually leaves, and that gets the
          // noopener pair: target="_blank" without it hands the opened page a
          // live handle on this one.
          //
          // The `//` guard matters: "//evil.com" is a protocol-relative URL to
          // another origin, and a naive startsWith("/") reads it as a route.
          a: ({ href, children }) => {
            const to = href ?? "#";
            const className =
              "text-teal-700 underline underline-offset-2 decoration-teal-300 hover:decoration-teal-600 transition-colors";

            if (to.startsWith("/") && !to.startsWith("//")) {
              return <Link href={to} className={className}>{children}</Link>;
            }
            const opensNewTab = /^https?:\/\//i.test(to) || to.startsWith("//");
            return (
              <a
                href={to}
                className={className}
                {...(opensNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
