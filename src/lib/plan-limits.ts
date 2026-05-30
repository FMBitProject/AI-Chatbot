export const PLAN_LIMITS = {
  starter: { maxDocuments: 10, maxEmployees: 5, maxQuestionsPerMonth: 100 },
  professional: { maxDocuments: 100, maxEmployees: 50, maxQuestionsPerMonth: Infinity },
  enterprise: { maxDocuments: Infinity, maxEmployees: Infinity, maxQuestionsPerMonth: Infinity },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;

export function getLimits(plan: string) {
  return PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.starter;
}
