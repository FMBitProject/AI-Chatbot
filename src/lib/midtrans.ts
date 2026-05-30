import MidtransClient from "midtrans-client";

let _snap: MidtransClient.Snap | null = null;

export function getSnap() {
  if (!_snap) {
    _snap = new MidtransClient.Snap({
      isProduction: process.env.MIDTRANS_ENV === "production",
      serverKey: process.env.MIDTRANS_SERVER_KEY!,
      clientKey: process.env.MIDTRANS_CLIENT_KEY!,
    });
  }
  return _snap;
}

export const PLAN_PRICES: Record<"professional" | "enterprise", number> = {
  professional: 200000,
  enterprise: 500000,
};

export const PLAN_NAMES: Record<"professional" | "enterprise", string> = {
  professional: "IntelliBase Professional — 1 Bulan",
  enterprise: "IntelliBase Enterprise — 1 Bulan",
};
