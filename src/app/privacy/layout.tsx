import type { Metadata } from "next";

// Client component; see the note in ../pricing/layout.tsx for why the metadata
// lives here.
export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description:
    "Bagaimana IntelliBase AI mengumpulkan, menggunakan, menyimpan, dan melindungi data perusahaan Anda — termasuk dokumen yang diunggah, log chat, dan hak Anda atas data tersebut.",
  // No `openGraph` key — see the note in src/app/page.tsx.
  alternates: { canonical: "/privacy" },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
