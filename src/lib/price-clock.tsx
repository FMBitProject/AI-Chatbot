"use client";

import { createContext, useContext } from "react";

// The moment prices are evaluated at, taken once on the server per request.
//
// Every price on /, /pricing and /roi is rendered by a client component, so
// without this getPlanPrice() runs twice with two different clocks: the
// server's for the HTML, then the visitor's device for hydration, and the
// device wins. A hospital laptop with its clock a week behind would keep
// showing the promo price after 1 January while /api/payment/create, which
// only ever uses the server's clock, bills the normal one. Around the deadline
// the two renders also disagree outright, which is a hydration mismatch.
//
// Passing one server timestamp down makes the server HTML, the hydrated page
// and the checkout agree. A tab left open across the deadline still shows the
// price from when it loaded; handlePay on /pricing catches that case by
// comparing the amount checkout returns.
const PriceClock = createContext<number | null>(null);

export function PriceClockProvider({ now, children }: { now: number; children: React.ReactNode }) {
  return <PriceClock.Provider value={now}>{children}</PriceClock.Provider>;
}

// Falls back to the device clock only outside a provider, which no priced page
// is. Kept as a fallback rather than a throw so a component reused somewhere
// new still renders a price instead of an error boundary.
export function usePriceNow(): Date {
  const now = useContext(PriceClock);
  return now === null ? new Date() : new Date(now);
}
