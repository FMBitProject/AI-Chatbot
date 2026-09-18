// maxQuestionsPerDayPerUser is an emergency brake, not an everyday fence: it
// only exists to stop one runaway user (or script) from draining the shared
// maxQuestionsPerDay pool. Calibrated so normal humans never hit it — one user
// can take at most 20% of their company's pool. Starter's pool (10/day) is too
// small to be worth "protecting" at the cost of solo-founder trials, and custom
// is a negotiated contract rather than a self-serve tier, so both stay uncapped.
//
// `enterprise` is deliberately NOT unlimited. It is bought self-serve at a flat
// monthly price, so an unbounded plan is an unbounded bill on our side: a large
// hospital group could subscribe for the price of a mid-size clinic and index
// its whole estate against our inference budget. The numbers below are set well
// above what any customer at that price should reach, so nobody bumps into them
// in normal use — anything genuinely bigger belongs on `custom`, where the price
// is agreed with the customer first. The one exception is a customer on BYOK,
// whose questions are not on our bill at all; see getLimits below.
//
// The two paid company tiers are sized for what they are sold as — `professional`
// is the "Klinik" package (25 staff, 300 documents) and `enterprise` is "Rumah
// Sakit" (150 staff, 1.000 documents); see the pricing rationale in pricing.ts.
// The seat numbers are the real fence here: a hospital that tries to take the
// smaller package runs out of seats during onboarding rather than quietly
// fitting its whole estate into the cheaper tier, which is what 100 seats on
// Enterprise used to allow.
//
// `custom` is the only unlimited tier, and it is NOT purchasable: it has no
// price, no checkout path, and `isPurchasablePlan()` in pricing.ts rejects it.
// A company only lands on it when we set it by hand after agreeing terms —
// which, per that conversation, means the customer brings their own API keys
// (BYOK), so unlimited usage costs us nothing per question.
//
// `personal` is the only tier an individual account can buy, and the only tier a
// company account cannot (both directions are enforced in /api/payment/create).
// maxEmployees is 1 because an individual workspace holds exactly its owner —
// the employee endpoints refuse it outright, so the number is a statement of
// what the tier is rather than a fence anything has to test. Its question
// allowance is deliberately close to Professional's per-user brake (60/day):
// one person on Personal should never do worse than the same person on a team
// plan, which is what would send them to a plan sold for six times the price to
// get seats they have nobody to fill.
export const PLAN_LIMITS = {
  starter:      { maxDocuments: 10,  maxEmployees: 5,   maxQuestionsPerMonth: 100, maxQuestionsPerDay: 10,   maxQuestionsPerDayPerUser: -1 },
  personal:     { maxDocuments: 50,  maxEmployees: 1,   maxQuestionsPerMonth: -1,  maxQuestionsPerDay: 60,   maxQuestionsPerDayPerUser: -1 },
  professional: { maxDocuments: 300,  maxEmployees: 25,  maxQuestionsPerMonth: -1, maxQuestionsPerDay: 300,  maxQuestionsPerDayPerUser: 60 },
  enterprise:   { maxDocuments: 1000, maxEmployees: 150, maxQuestionsPerMonth: -1, maxQuestionsPerDay: 2000, maxQuestionsPerDayPerUser: 400 },
  custom:       { maxDocuments: -1,  maxEmployees: -1,  maxQuestionsPerMonth: -1,  maxQuestionsPerDay: -1,   maxQuestionsPerDayPerUser: -1 },
} as const;

// -1 means unlimited

export type Plan = keyof typeof PLAN_LIMITS;

export interface PlanLimits {
  maxDocuments: number;
  maxEmployees: number;
  maxQuestionsPerMonth: number;
  maxQuestionsPerDay: number;
  maxQuestionsPerDayPerUser: number;
}

// `hasOwnKeys` means the WHOLE question runs on the customer's own provider
// account — generation and the embedding in front of it. Callers must get it
// from `billsOwnProvider()`, never from `ownOnly` alone: that flag covers
// generation only, and a workspace with a Groq key but no Gemini one still
// embeds every question on our key. See the note there.
//
// Every question allowance above exists to bound OUR inference bill — that is
// the whole argument for capping `enterprise` rather than selling it unlimited.
// When the customer brings their own key, each question is billed to them by
// Groq or Google directly, so the reason for the cap is gone and keeping it
// would be charging a hospital Rp 4,5jt plus its own API spend and still
// stopping it at 2.000 questions. The per-user brake goes with them: it only
// ever protected the shared company pool, and there is no shared pool left.
//
// Documents and seats deliberately do NOT move. Chunks and their pgvector
// embeddings sit in our database for as long as the customer stays, whoever
// paid to compute them, and seats are what the tier is priced on.
//
// Paid plans only. An unrecognised plan resolves to starter, and starter keeps
// its 10/day whatever keys are configured — otherwise a free workspace could
// lift its own ceiling by pasting in a key, which is the one path that turns
// this into a way around the paywall rather than a concession to a customer.
export function getLimits(plan: string, hasOwnKeys = false): PlanLimits {
  const key: Plan = plan in PLAN_LIMITS ? (plan as Plan) : "starter";
  // TODO: MINOR — cabang ini mengembalikan objek PLAN_LIMITS itu sendiri (bukan
  // salinan), jadi pemanggil bisa memutasinya untuk semua tenant. Perilaku lama,
  // tidak ada pemanggil yang melakukannya; kembalikan salinan saat dirapikan.
  const limits = PLAN_LIMITS[key];
  if (!hasOwnKeys || key === "starter") return limits;
  return { ...limits, maxQuestionsPerDay: -1, maxQuestionsPerMonth: -1, maxQuestionsPerDayPerUser: -1 };
}

export function isUnderLimit(current: number, max: number) {
  return max === -1 || current < max;
}
