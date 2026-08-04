import type { Metadata } from "next";

// Client component; see the note in ../pricing/layout.tsx for why the metadata
// lives here.
export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description:
    "Bagaimana IntelliBase AI mengumpulkan, menggunakan, menyimpan, dan melindungi data perusahaan Anda — termasuk dokumen yang diunggah, log chat, dan hak Anda atas data tersebut.",
  alternates: { canonical: "/privacy" },
  openGraph: { url: "/privacy" },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
