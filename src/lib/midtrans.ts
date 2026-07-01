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

// Plan pricing and names now live in @/lib/pricing (single source of truth).
