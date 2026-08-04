// The posting grid: which days, how many posts per day, and at what time.
//
// Changing the cadence should mean editing this file and nothing else — the
// generator, the validator, the Markdown renderer and the Buffer push all read
// their shape from here rather than hardcoding a day list or a posting time.

export const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

// One slot a day, 16.15 WIB. Slots are named rather than numbered so the model
// knows what register a slot wants, and so scheduling has a concrete time.
//
// Only local WIB time is stored; the UTC conversion is derived in slotDueAt().
// Carrying a second hand-maintained `utc` field would be one more thing to keep
// in sync, and it silently breaks for any slot before 07:00 WIB — that lands on
// the *previous* UTC day, which a literal time string can't express.
//
// To go back to twice a day, add a second entry — every other file reads its
// shape from here, so nothing else needs to change:
//   { id: "pagi", label: "Pagi", wib: "07:30" }
export const SLOTS = [
  { id: "sore", label: "Sore", wib: "16:15" },
];

// WIB (Asia/Jakarta) is UTC+7 year-round — no daylight saving.
const WIB_OFFSET_MINUTES = 7 * 60;

export const SLOT_IDS = SLOTS.map((s) => s.id);
export const PLATFORMS = ["linkedin", "youtube", "instagram"];

/** Every (day, slot) pair the pack must fill, in posting order. */
export function grid() {
  return DAYS.flatMap((day) => SLOTS.map((slot) => ({ day, slot: slot.id })));
}

export const PER_PLATFORM = DAYS.length * SLOTS.length; // 14

/**
 * ISO (UTC) timestamp for a slot, given the Monday the week starts on.
 *
 * Everything is done as minute arithmetic on a Date rather than by building a
 * date string, so the two rollovers that a template literal gets wrong both
 * fall out for free: a slot before 07:00 WIB belongs to the previous UTC day,
 * and adding the day offset can cross a month or year boundary.
 */
export function slotDueAt(weekOfMonday, day, slotId) {
  const slot = SLOTS.find((s) => s.id === slotId);
  if (!slot) throw new Error(`slot tidak dikenal: ${slotId}`);
  const dayOffset = DAYS.indexOf(day);
  if (dayOffset === -1) throw new Error(`hari tidak dikenal: ${day}`);

  const [hh, mm] = slot.wib.split(":").map(Number);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) {
    throw new Error(`jam slot "${slot.id}" tidak valid: ${slot.wib} (harus HH:MM)`);
  }

  // Midnight WIB on the target local day, expressed in UTC, then the local
  // time-of-day added and the WIB offset removed.
  const d = new Date(`${weekOfMonday}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`tanggal tidak valid: ${weekOfMonday}`);
  d.setUTCMinutes(d.getUTCMinutes() + dayOffset * 24 * 60 + hh * 60 + mm - WIB_OFFSET_MINUTES);
  return d.toISOString();
}
