// maxQuestionsPerDayPerUser is a fairness cap *inside* the shared company
// quota: it stops one heavy user from draining maxQuestionsPerDay for
// everyone else. Enterprise stays uncapped — that's what the plan sells.
export const PLAN_LIMITS = {
  starter:      { maxDocuments: 10,  maxEmployees: 5,  maxQuestionsPerMonth: 100, maxQuestionsPerDay: 10,  maxQuestionsPerDayPerUser: 5  },
  professional: { maxDocuments: 100, maxEmployees: 50, maxQuestionsPerMonth: -1,  maxQuestionsPerDay: 300, maxQuestionsPerDayPerUser: 30 },
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
