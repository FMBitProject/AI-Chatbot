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
// is agreed with the customer first.
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
  professional: { maxDocuments: 100, maxEmployees: 50,  maxQuestionsPerMonth: -1,  maxQuestionsPerDay: 300,  maxQuestionsPerDayPerUser: 60 },
  enterprise:   { maxDocuments: 500, maxEmployees: 200, maxQuestionsPerMonth: -1,  maxQuestionsPerDay: 2000, maxQuestionsPerDayPerUser: 400 },
  custom:       { maxDocuments: -1,  maxEmployees: -1,  maxQuestionsPerMonth: -1,  maxQuestionsPerDay: -1,   maxQuestionsPerDayPerUser: -1 },
} as const;

// -1 means unlimited

export type Plan = keyof typeof PLAN_LIMITS;

export function getLimits(plan: string) {
  return PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.starter;
}

export function isUnderLimit(current: number, max: number) {
  return max === -1 || current < max;
}
