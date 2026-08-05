import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/language-context";
import { CookieConsent } from "@/components/CookieConsent";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { AnalyticsConsent } from "@/components/AnalyticsConsent";
import { VercelAnalytics } from "@/components/VercelAnalytics";
import { siteOrigin } from "@/lib/site-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// preload: false because this is the root layout, where Next preloads a font on
// every single route — but font-mono is used on almost none of them (an API key
// field and a masked key row, both inside the admin subscription area). Every
// other page was downloading a font it never drew, and the browser said so:
// "resource was preloaded using link preload but not used". The @font-face still
// ships, so the few places that do use it still get Geist Mono; it is fetched
// when something actually needs it rather than ahead of every page.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

// Display face for headings only, and deliberately a single 400 weight: the
// calm of a serif headline comes from it not shouting, and there is no bold to
// reach for by accident. Body text stays on the sans — a serif at 14px on a
// marketing page is harder to read, not more elegant.
const instrumentSerif = Instrument_Serif({
  // Named after the font, not after the role. `--font-display: var(--font-display)`
  // in the theme block would be a variable defined as itself, and the utility
  // would silently resolve to nothing.
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  // Without this, every URL-based metadata field has to be an absolute string
  // and `opengraph-image` has no origin to resolve against — which is how a
  // shared link ends up advertising an image nobody can load. The env var is
  // what production already uses for auth callbacks, so the canonical domain
  // is stated in one place; the literal is the fallback for local builds.
  metadataBase: new URL(siteOrigin()),
  title: { default: "IntelliBase AI", template: "%s — IntelliBase AI" },
  description: "Platform RAG untuk akses SOP, regulasi, dan panduan perusahaan secara instan melalui AI chat. Multi-tenant, aman, dan mudah digunakan.",
  keywords: ["knowledge base", "AI chat", "internal dokumen", "SOP", "RAG", "perusahaan", "HR"],
  openGraph: {
    title: "IntelliBase AI — Knowledge Base Internal Perusahaan",
    description: "Karyawan bisa tanya apa saja tentang kebijakan perusahaan dan dapat jawaban instan dari AI.",
    type: "website",
    locale: "id_ID",
    siteName: "IntelliBase AI",
    // No `url` here. Root-layout metadata is inherited by every route that does
    // not override it, so a literal "/" made /pricing and every solusi page
    // advertise the homepage as their own social URL.
    //
    // Nor is it set per page: nested metadata objects are replaced rather than
    // merged, so a page defining `openGraph` just to carry a `url` loses this
    // card's title, description, site_name, locale, and its image. An absent
    // og:url costs nothing — platforms fall back to the URL actually shared —
    // while a missing image is a visibly broken link preview. The per-page
    // signal that matters is `alternates.canonical`, which merges cleanly.
  },
  // summary_large_image, not the default summary: the card is 1200×630, and
  // the small variant crops it to a square thumbnail that cuts the headline in
  // half. The image itself comes from `twitter-image.tsx`.
  twitter: {
    card: "summary_large_image",
    title: "IntelliBase AI — Knowledge Base Internal Perusahaan",
    description: "Karyawan bisa tanya apa saja tentang kebijakan perusahaan dan dapat jawaban instan dari AI.",
  },
  // Google Search Console ownership proof for the https://www.intellibaseai.com
  // URL-prefix property. Next renders this as
  // <meta name="google-site-verification" content="..." /> in <head>.
  //
  // It lives here rather than in DNS because the Hostinger zone took hours to
  // publish each edit, and the TXT record it did publish was silently truncated
  // to the first 34 of the token's 43 characters — which Google reports as the
  // confusing "we couldn't find your verification token" while listing that
  // very token back at you. A deploy is deterministic and visible immediately.
  //
  // Do not remove: Search Console revokes a property when the proof disappears,
  // and losing it takes the sitemap and indexing history with it.
  verification: { google: "Vz3OmCurr5FUjbkqLhhpH9np4TKKJOUZO3SlMT9Aarw" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "IntelliBase",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A2E2E",
};

function ServiceWorkerRegistration() {
  const script = `
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js', { scope: '/' });
      });
    }
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        <LanguageProvider>
          {children}
          <CookieConsent />
          <WhatsAppButton />
          <AnalyticsConsent />
        </LanguageProvider>
        <VercelAnalytics />
      </body>
    </html>
  );
}
