import { LandingContent } from "@/components/LandingContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "IntelliBase AI — Knowledge Base Internal Perusahaan Berbasis AI",
  description: "Platform RAG untuk akses SOP, regulasi, dan panduan perusahaan secara instan melalui AI chat. Multi-tenant, aman, dan mudah digunakan.",
  // Self-referencing canonical. The site is linked from social posts that carry
  // UTM parameters, and without this every `?utm_source=...` variant is a
  // separate page to a crawler, splitting the ranking signal of one page across
  // several near-identical URLs.
  alternates: { canonical: "/" },
  // Deliberately no `openGraph` key. Nested metadata objects are not merged —
  // a child segment that defines `openGraph` replaces the parent's entirely, so
  // setting just a `url` here silently dropped the card's title, description,
  // site_name, locale, and the image resolved from opengraph-image.tsx.
};

export default function HomePage() {
  return <LandingContent />;
}
