import { connection } from "next/server";

// The timestamp a priced page hands to PriceClockProvider (see price-clock.tsx).
//
// connection() first, so the route renders per request instead of freezing the
// build's clock into the HTML: a page prerendered in December would otherwise
// keep quoting promo prices in January. Kept out of the page components because
// reading the clock is exactly what the React purity lint rejects in a render
// body, and here it is the point: one reading per request, shared by the whole
// page.
export async function requestPriceTime(): Promise<number> {
  await connection();
  return Date.now();
}
