import type { Lang } from "@/lib/i18n";

export const DEMO_MAX_QUESTION = 300;

// The suggested questions, per language.
//
// The demo corpus itself is Indonesian and stays that way — these are the
// documents a hospital here actually owns. The English list is not a second
// corpus, it is the same four questions asked in English: retrieval is
// cross-lingual (gemini-embedding-001 embeds both into one space, verified
// against the live endpoint), and the answer is written in whichever language
// the visitor is reading, so an English question returns an English answer
// grounded in the Indonesian source — with the Indonesian excerpt shown in the
// citation card, which is the honest thing to show.
//
// Each English question deliberately keeps the clinical term the topical filter
// in policy.ts keys on ("transfusion", "code blue", "high alert", "patient
// fall"). That filter is a cost/UX gate, not the security boundary, but a
// suggested question the product then refuses is the worst possible first
// impression — so the two files are written against each other on purpose.
export const DEMO_QUESTIONS: Record<Lang, readonly string[]> = {
  id: [
    "Berapa lama observasi setelah transfusi?",
    "Siapa yang harus dihubungi saat code blue?",
    "Bagaimana pemeriksaan obat high alert dilakukan?",
    "Apa saja yang dicatat saat pasien jatuh?",
  ],
  en: [
    "How long is the observation after a transfusion?",
    "Who should be contacted during a code blue?",
    "How is a high alert medication check carried out?",
    "What is recorded after a patient fall?",
  ],
};

export type DemoCitation = { id: string; text: string; documentName: string; number?: number };
export type DemoFrame =
  | { type: "sources"; citations: DemoCitation[] }
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };
