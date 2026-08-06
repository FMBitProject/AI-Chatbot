// The single place the "how much time IntelliBase saves" claim lives.
//
// Every number here is an assumption we made, not a result we measured from a
// customer, so every surface that shows a figure derived from it also has to
// show ESTIMATE_NOTE. They live together for the same reason: the numbers used
// to be literals in six places across the landing page and the ROI calculator,
// and the note was copy-pasted into both — the English halves had already
// drifted apart before anyone noticed.
//
// The model deliberately discounts itself three times. The old one multiplied
// the whole cost of search time by 0.9 and called the result a saving, which
// quietly assumed three things that are not true: that the assistant can answer
// every question, that reading its answer is free, and that every minute an
// employee does not spend searching turns into an hour of billable output. The
// arithmetic was fine; the claim was not. Each of the constants below is one of
// those assumptions, made explicit so a sceptical buyer can argue with it — and
// so the page can show them rather than bury them.

// Share of internal questions the assistant can actually answer from what a
// company has indexed. The rest still need a human: they are about something
// undocumented, or about a decision no document has been written for yet.
export const ANSWERABLE_SHARE = 0.7;

// What an answered question still costs the employee: reading the answer and
// checking the citation it points at. Only the difference against a manual
// search counts as saved — never the whole search.
export const MINUTES_WITH_AI = 3;

// Share of the saved time that becomes recovered output. Minutes returned in
// ones and twos across a day do not add up to whole hours of extra work, and
// pretending they do is how ROI calculators end up unbelievable.
export const REALIZED_SHARE = 0.5;

// Percentages, derived so the prose can never disagree with the arithmetic.
export const ANSWERABLE_SHARE_LABEL = `${Math.round(ANSWERABLE_SHARE * 100)}%`;
export const REALIZED_SHARE_LABEL = `${Math.round(REALIZED_SHARE * 100)}%`;

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
  // 15, not the 20 this used to open on: three searches a day at twenty minutes
  // put every employee on the calculator's own worst case before the visitor
  // had touched anything.
  minutesPerSearch: 15,
  salaryPerMonth: 6_000_000,
  workingDays: 22,
};

export type RoiInputs = typeof ROI_DEFAULTS;

const MINUTES_PER_HOUR = 60;
const HOURS_PER_WORKDAY = 8;

export function calculateRoi(inputs: RoiInputs) {
  const { employees, questionsPerDay, minutesPerSearch, salaryPerMonth, workingDays } = inputs;

  const questionsPerMonth = employees * questionsPerDay * workingDays;
  const hoursPerMonth = (questionsPerMonth * minutesPerSearch) / MINUTES_PER_HOUR;
  const hourlyRate = salaryPerMonth / (workingDays * HOURS_PER_WORKDAY);
  const costLost = hoursPerMonth * hourlyRate;

  // Guarded because the slider's floor (5 minutes) can sit below what using the
  // assistant costs on a slow question. A search that was already faster than
  // reading an answer saves nothing; it must never save a negative amount.
  const minutesSavedPerQuestion = Math.max(0, minutesPerSearch - MINUTES_WITH_AI);
  const hoursSaved = (questionsPerMonth * ANSWERABLE_SHARE * minutesSavedPerQuestion) / MINUTES_PER_HOUR;
  const grossSaving = hoursSaved * hourlyRate;
  const savingsWithAI = grossSaving * REALIZED_SHARE;

  return {
    hoursPerMonth,
    costLost,
    hoursSaved,
    // What the time saved would be worth if every recovered minute became work.
    // Shown next to savingsWithAI so the discount we apply is visible, not
    // just asserted.
    grossSaving,
    savingsWithAI,
    // Of the money currently going into search time, the share this claims back.
    // Zero-guarded for the degenerate inputs the sliders cannot reach but a
    // future caller could pass.
    recoveredShare: costLost > 0 ? savingsWithAI / costLost : 0,
  };
}

// The headline percentage the landing page quotes, derived from the defaults
// rather than written down. It is the share of search cost recovered *after*
// all three discounts — a much smaller and much more defensible number than the
// per-question reduction, which is the one every competitor puts on a billboard.
export const RECOVERED_SHARE_LABEL = `~${Math.round(calculateRoi(ROI_DEFAULTS).recoveredShare * 100)}%`;
