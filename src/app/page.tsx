import { LandingContent } from "@/components/LandingContent";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "IntelliBase AI — Knowledge Base Internal Perusahaan Berbasis AI",
  description: "Platform RAG untuk akses SOP, regulasi, dan panduan perusahaan secara instan melalui AI chat. Multi-tenant, aman, dan mudah digunakan.",
};

export default function HomePage() {
  return <LandingContent />;
}
