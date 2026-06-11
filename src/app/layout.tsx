import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/lib/language-context";
import { CookieConsent } from "@/components/CookieConsent";
import { WhatsAppButton } from "@/components/WhatsAppButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "IntelliBase AI", template: "%s — IntelliBase AI" },
  description: "Platform RAG untuk akses SOP, regulasi, dan panduan perusahaan secara instan melalui AI chat. Multi-tenant, aman, dan mudah digunakan.",
  keywords: ["knowledge base", "AI chat", "internal dokumen", "SOP", "RAG", "perusahaan", "HR"],
  openGraph: {
    title: "IntelliBase AI — Knowledge Base Internal Perusahaan",
    description: "Karyawan bisa tanya apa saja tentang kebijakan perusahaan dan dapat jawaban instan dari AI.",
    type: "website",
    locale: "id_ID",
  },
  themeColor: "#0A2E2E",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "IntelliBase",
  },
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegistration />
        <LanguageProvider>
          {children}
          <CookieConsent />
          <WhatsAppButton />
        </LanguageProvider>
      </body>
    </html>
  );
}
