import { formatRupiah, getPlanDiscount, NORMAL_PRICES, PROMO_DEADLINE_LABEL, type PurchasablePlan } from "@/lib/pricing";

export function PlanPromotion({ plan, lang }: { plan: PurchasablePlan; lang: "id" | "en" }) {
  const discount = getPlanDiscount(plan);
  if (!discount) return null;

  return (
    <div className="my-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <del className="text-stone-500">{formatRupiah(NORMAL_PRICES[plan], lang)}</del>
        <span className="rounded-full bg-teal-100 px-2 py-0.5 font-semibold text-teal-800">
          {lang === "id" ? `Diskon ${discount}%` : `${discount}% off`}
        </span>
      </div>
      <p className="mt-1 text-stone-500">{PROMO_DEADLINE_LABEL[lang]}</p>
    </div>
  );
}
