import type { Metadata } from "next";

// Client component; see the note in ../pricing/layout.tsx for why the metadata
// lives here.
export const metadata: Metadata = {
  title: "Syarat & Ketentuan",
  description:
    "Syarat dan ketentuan penggunaan layanan IntelliBase AI: ketentuan akun, deskripsi layanan, pembayaran dan langganan, serta batasan tanggung jawab.",
  // No `openGraph` key — see the note in src/app/page.tsx.
  alternates: { canonical: "/terms" },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
