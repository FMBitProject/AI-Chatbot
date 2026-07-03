// maxQuestionsPerDayPerUser is an emergency brake, not an everyday fence: it
// only exists to stop one runaway user (or script) from draining the shared
// maxQuestionsPerDay pool. Calibrated so normal humans never hit it — one
// professional user can take at most 20% of the company pool. Starter's pool
// (10/day) is too small to be worth "protecting" at the cost of solo-founder
// trials, and enterprise sells unlimited, so both stay uncapped.
export const PLAN_LIMITS = {
  starter:      { maxDocuments: 10,  maxEmployees: 5,  maxQuestionsPerMonth: 100, maxQuestionsPerDay: 10,  maxQuestionsPerDayPerUser: -1 },
  professional: { maxDocuments: 100, maxEmployees: 50, maxQuestionsPerMonth: -1,  maxQuestionsPerDay: 300, maxQuestionsPerDayPerUser: 60 },
  enterprise:   { maxDocuments: -1,  maxEmployees: -1, maxQuestionsPerMonth: -1,  maxQuestionsPerDay: -1,  maxQuestionsPerDayPerUser: -1 },
} as const;

// -1 means unlimited

export type Plan = keyof typeof PLAN_LIMITS;

export function getLimits(plan: string) {
  return PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.starter;
}

export function isUnderLimit(current: number, max: number) {
  return max === -1 || current < max;
}
