import type { Metadata } from "next";

// The page itself is a client component (it reads the language context and the
// live promo window), and a client component cannot export `metadata` — so the
// route's metadata lives in a layout instead. Without this the page inherited
// the root layout's defaults and shipped as `<title>IntelliBase AI</title>`,
// identical to four other routes.
//
// No prices in the description: the launch promo reverts on 1 Jan 2027 and the
// app's prices revert with it, but a literal here would keep advertising a
// number we no longer charge. The page renders the real figures from
// `src/lib/pricing.ts`.
export const metadata: Metadata = {
  title: "Harga & Paket Langganan",
  description:
    "Paket Starter gratis, Professional, dan Enterprise untuk knowledge base internal berbasis AI. Semua paket termasuk enkripsi data dan isolasi multi-tenant per perusahaan.",
  // No `openGraph` key — see the note in src/app/page.tsx.
  alternates: { canonical: "/pricing" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
