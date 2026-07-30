// The single place the "how much time IntelliBase saves" claim lives.
//
// It is an assumption we made, not a result we measured from a customer, so
// every surface that shows a number derived from it also has to show
// ESTIMATE_NOTE. Both live here for the same reason: the number used to be a
// literal in six places across the landing page and the ROI calculator, and the
// note was copy-pasted into both — the English halves had already drifted apart
// before anyone noticed.
export const SEARCH_TIME_REDUCTION = 0.9;

// "90%", derived so the prose can never disagree with the arithmetic.
export const SEARCH_TIME_REDUCTION_LABEL = `${Math.round(SEARCH_TIME_REDUCTION * 100)}%`;

// Shown wherever a starred figure appears. Deliberately says what the reader
// cannot otherwise tell — that the figure comes from our assumptions rather than
// observed usage — instead of restating the percentage they just read.
export const ESTIMATE_NOTE = {
  id: "* Estimasi berdasarkan asumsi internal kami, bukan hasil pengukuran pelanggan. Hasil aktual dapat bervariasi.",
  en: "* Estimates are based on our own assumptions, not measured customer results. Actual results may vary.",
};

// Starting values for the full calculator, and the fixed values behind the
// landing page's teaser slider — which varies only headcount. Shared so the
// teaser can never quote a figure the page it links to disagrees with.
export const ROI_DEFAULTS = {
  employees: 50,
  questionsPerDay: 3,
  minutesPerSearch: 20,
  salaryPerMonth: 6_000_000,
  workingDays: 22,
};

export type RoiInputs = typeof ROI_DEFAULTS;

const MINUTES_PER_HOUR = 60;
const HOURS_PER_WORKDAY = 8;

export function calculateRoi(inputs: RoiInputs) {
  const { employees, questionsPerDay, minutesPerSearch, salaryPerMonth, workingDays } = inputs;
  const hoursPerMonth = (employees * questionsPerDay * minutesPerSearch * workingDays) / MINUTES_PER_HOUR;
  const hourlyRate = salaryPerMonth / (workingDays * HOURS_PER_WORKDAY);
  const costLost = hoursPerMonth * hourlyRate;
  return { hoursPerMonth, costLost, savingsWithAI: costLost * SEARCH_TIME_REDUCTION };
}
