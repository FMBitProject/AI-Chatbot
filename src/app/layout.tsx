import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/language-context";
import { CookieConsent } from "@/components/CookieConsent";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { AnalyticsConsent } from "@/components/AnalyticsConsent";
import { VercelAnalytics } from "@/components/VercelAnalytics";

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

export const metadata: Metadata = {
  // Without this, every URL-based metadata field has to be an absolute string
  // and `opengraph-image` has no origin to resolve against — which is how a
  // shared link ends up advertising an image nobody can load. The env var is
  // what production already uses for auth callbacks, so the canonical domain
  // is stated in one place; the literal is the fallback for local builds.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://www.intellibaseai.com"),
  title: { default: "IntelliBase AI", template: "%s — IntelliBase AI" },
  description: "Platform RAG untuk akses SOP, regulasi, dan panduan perusahaan secara instan melalui AI chat. Multi-tenant, aman, dan mudah digunakan.",
  keywords: ["knowledge base", "AI chat", "internal dokumen", "SOP", "RAG", "perusahaan", "HR"],
  openGraph: {
    title: "IntelliBase AI — Knowledge Base Internal Perusahaan",
    description: "Karyawan bisa tanya apa saja tentang kebijakan perusahaan dan dapat jawaban instan dari AI.",
    type: "website",
    locale: "id_ID",
    siteName: "IntelliBase AI",
    url: "/",
  },
  // summary_large_image, not the default summary: the card is 1200×630, and
  // the small variant crops it to a square thumbnail that cuts the headline in
  // half. The image itself comes from `twitter-image.tsx`.
  twitter: {
    card: "summary_large_image",
    title: "IntelliBase AI — Knowledge Base Internal Perusahaan",
    description: "Karyawan bisa tanya apa saja tentang kebijakan perusahaan dan dapat jawaban instan dari AI.",
  },
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
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
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
