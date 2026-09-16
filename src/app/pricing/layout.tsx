import type { Metadata } from "next";

// The page itself is a client component (it reads the language context and the
// live promo window), and a client component cannot export `metadata` — so the
// route's metadata lives in a layout instead. Without this the page inherited
// the root layout's defaults and shipped as `<title>IntelliBase AI</title>`,
// identical to four other routes.
//
// No prices in the description: a literal here is a second copy of a number,
// and the one place a price may live is `src/lib/pricing.ts`, which is what the
// page itself renders from. Plan names are safe to write out — they change far
// less often than the figures, and a search result that names the packages is
// what a hospital is scanning for.
export const metadata: Metadata = {
  title: "Harga & Paket Langganan",
  description:
    "Paket Starter gratis, Klinik, dan Rumah Sakit untuk knowledge base internal berbasis AI. Semua paket termasuk enkripsi data dan isolasi multi-tenant per perusahaan.",
  // No `openGraph` key — see the note in src/app/page.tsx.
  alternates: { canonical: "/pricing" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
