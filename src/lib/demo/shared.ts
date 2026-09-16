export const DEMO_MAX_QUESTION = 300;
export const DEMO_QUESTIONS = [
  "Berapa lama observasi setelah transfusi?",
  "Siapa yang harus dihubungi saat code blue?",
  "Bagaimana pemeriksaan obat high alert dilakukan?",
  "Apa saja yang dicatat saat pasien jatuh?",
] as const;
export type DemoCitation = { id: string; text: string; documentName: string; number?: number };
export type DemoFrame =
  | { type: "sources"; citations: DemoCitation[] }
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };
