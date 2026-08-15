"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogoHomeLink } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLang } from "@/lib/language-context";
import { pricing } from "@/lib/i18n";
import { CheckCircle2, XCircle, Zap, ArrowRight, MessageSquare, FileText, Users, Shield, BarChart2, Link2, HardDrive, Loader2, Info, User, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { SiteFooter } from "@/components/SiteFooter";
import { NORMAL_PRICES, PROMO_PRICES as PROMO, isPromoActive, formatRupiah, isPurchasablePlan, type PurchasablePlan } from "@/lib/pricing";
import { consultationMailto } from "@/lib/contact";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const FEATURE_ICONS = [MessageSquare, FileText, Users, Shield, BarChart2, Link2, HardDrive];

type Audience = "individual" | "company";

export default function PricingPage() {
  const { lang } = useLang();
  const T = pricing[lang];

  // Which audience's cards are on screen. Two sets of plans rather than one long
  // row, because the tiers are not points on a single scale: Personal is not a
  // smaller Professional, it is the same product sold to one person, and putting
  // them side by side asks every visitor to work out which half is about them.
  const [audience, setAudience] = useState<Audience>("company");

  // The landing page carries its own tab here as `?type=individual`, so a
  // visitor who read the individual pitch does not arrive at three team tiers
  // and have to find the switch again.
  //
  // Read from `window.location` in an effect rather than with useSearchParams,
  // and that is not a stylistic preference. useSearchParams makes the tree up to
  // the nearest Suspense boundary client-rendered; wrapping the page in one — the
  // fix Next's own docs point to — left this route prerendering an empty shell.
  // Measured, not assumed: pricing.html went from a full page to 18 KB of
  // chrome, with no hero, no plan cards and no FAQ for a crawler to read. That
  // is a poor trade for a hint, on the page most likely to be found from search.
  // Applied after hydration instead, which costs one frame on the default tab.
  //
  // It is only a starting point either way: the tabs still work, and for a
  // signed-in visitor the account type below overrules it — the URL is a hint
  // from a marketing page, the account is the fact, and the checkout enforces
  // the account.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("type") === "individual") {
      // Deliberate: the query string is a browser-only value, so the first
      // render cannot know it. Reading it into the initial state instead would
      // render "individual" on the client against the "company" the server
      // prerendered, which is a hydration mismatch rather than a fix.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAudience("individual");
    }
  }, []);

  // The cards used to be addressed by position (`idx === 1 ? professional :
  // enterprise`), which silently mapped every card that was not Professional
  // onto Enterprise — so adding a fourth card sent its buyers to the wrong
  // checkout. Everything below is keyed by plan instead, and the key list is
  // what decides how many cards render.
  const COMPANY_PLAN_KEYS = ["starter", "professional", "enterprise", "custom"] as const;
  const INDIVIDUAL_PLAN_KEYS = ["starter", "personal"] as const;
  const isIndividual = audience === "individual";
  const PLAN_KEYS: readonly ("starter" | "personal" | "professional" | "enterprise" | "custom")[] =
    isIndividual ? INDIVIDUAL_PLAN_KEYS : COMPANY_PLAN_KEYS;
  const PLAN_COPY = isIndividual ? T.individualPlans : T.plans;
  const FEATURES = isIndividual ? T.individualFeatures : T.features;

  // Prices and promo state come from the shared pricing module, so this page
  // (and the checkout) automatically revert to normal prices once the promo ends.
  // Keyed to PLAN_KEYS rather than to `string`: a plan added to that list with
  // no entry here is then a type error, not a card that renders the price
  // "undefined". Partial because the two tiers without a list price — starter
  // and custom — are supposed to be missing.
  const promoActive = isPromoActive();
  type PlanKey = (typeof PLAN_KEYS)[number];
  const ORIGINAL_PRICES: Partial<Record<PlanKey, string>> = {
    personal: formatRupiah(NORMAL_PRICES.personal, lang),
    professional: formatRupiah(NORMAL_PRICES.professional, lang),
    enterprise: formatRupiah(NORMAL_PRICES.enterprise, lang),
  };
  const PROMO_PRICES: Partial<Record<PlanKey, string>> = {
    personal: formatRupiah(PROMO.personal, lang),
    professional: formatRupiah(PROMO.professional, lang),
    enterprise: formatRupiah(PROMO.enterprise, lang),
  };
  const HAS_PROMO: Partial<Record<PlanKey, boolean>> = {
    personal: promoActive,
    professional: promoActive,
    enterprise: promoActive,
  };
  const { data: session } = authClient.useSession();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  // A signed-in visitor is shown their own side of the page. Most of them arrive
  // from "Upgrade Paket" in the dashboard, and an individual landing on three
  // team tiers would be choosing between plans the checkout is going to refuse.
  //
  // The session cannot answer this — it is a seven-day cookie carrying user
  // columns, and the account type lives on the workspace — so it is asked for.
  // Anonymous visitors and any failure leave the default tab alone, which is
  // still switchable by hand: this decides where someone starts, not what they
  // may see.
  //
  // It decides that exactly once. The dependency is `session?.user`, an object
  // whose identity changes every time better-auth re-emits the session (a
  // refetch on window focus is enough), so without this latch the effect fires
  // again mid-visit and setAudience overwrites a tab the visitor chose by hand —
  // an individual comparing the team plans would watch the page snap back under
  // them. Latched on success only, so a failed request can still be answered by
  // a later emission.
  const audienceResolved = useRef(false);
  useEffect(() => {
    if (!session?.user || audienceResolved.current) return;
    let cancelled = false;
    fetch("/api/user/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { accountType?: Audience } | null) => {
        if (cancelled || !data?.accountType) return;
        audienceResolved.current = true;
        setAudience(data.accountType);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [session?.user]);

  async function handlePay(plan: PurchasablePlan) {
    // .assign() rather than assigning to .href: the React Compiler lint rejects
    // the assignment form here ("this value cannot be modified"). Same navigation.
    if (!session) { window.location.assign("/register"); return; }
    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json() as { token?: string; orderId?: string; message?: string };
      if (!res.ok || !data.token) {
        setLoadingPlan(null);
        alert(data.message ?? "Gagal memulai pembayaran. Silakan coba lagi.");
        return;
      }

      // Load Midtrans Snap script dynamically
      const clientKey = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? "";
      if (!document.getElementById("midtrans-snap")) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.id = "midtrans-snap";
          script.src = process.env.NEXT_PUBLIC_MIDTRANS_ENV === "production"
            ? "https://app.midtrans.com/snap/snap.js"
            : "https://app.sandbox.midtrans.com/snap/snap.js";
          script.setAttribute("data-client-key", clientKey);
          script.onload = () => resolve();
          // Without an onerror the promise simply never settles when the
          // Midtrans CDN is unreachable: the await hangs, loadingPlan is never
          // cleared, and every plan button on the page stays disabled behind a
          // spinner until the visitor reloads. Rejecting hands it to the catch
          // below, which explains itself and re-enables the buttons.
          script.onerror = () => {
            script.remove(); // so a retry is not blocked by the failed tag
            reject(new Error("Midtrans Snap failed to load"));
          };
          document.body.appendChild(script);
        });
      }

      // Carry the order id to the success page. Without it that page can only
      // tell the server "a professional order, probably" and let it guess which
      // one — see the fallback in /api/payment/verify.
      const successUrl = `/payment/success?plan=${plan}${data.orderId ? `&orderId=${encodeURIComponent(data.orderId)}` : ""}`;

      (window as unknown as { snap: { pay: (token: string, opts: object) => void } }).snap.pay(data.token, {
        onSuccess: () => { window.location.href = successUrl; },
        onPending: () => { window.location.href = "/payment/pending"; },
        onError: () => { window.location.href = "/payment/failed"; },
        onClose: () => setLoadingPlan(null),
      });
    } catch {
      setLoadingPlan(null);
      alert("Gagal memulai pembayaran. Silakan coba lagi.");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-hairline bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          {/* The only way back to the landing page this header offers: the
              other controls all lead deeper in (login, register, dashboard).
              Someone who arrived here from a search result or a shared link has
              no back button to fall back on. */}
          <LogoHomeLink size="sm" lang={lang} className="shrink-0" />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            {mounted && session?.user ? (
              <Link href="/chat">
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-xs sm:text-sm px-3 sm:px-4">
                  {lang === "en" ? "Go to Dashboard" : "Buka Dashboard"}
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm" className="hidden sm:inline-flex">{T.signin}</Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-xs sm:text-sm px-3 sm:px-4">{T.startFree}</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Promo Banner */}
      {promoActive && (
        <div className="bg-gradient-to-r from-orange-500 to-pink-500 text-white text-center py-2.5 px-4 text-sm font-medium">
          {T.promoBanner} &nbsp;·&nbsp; <span className="underline">{T.promoEnds}</span>
        </div>
      )}

      {/* Hero */}
      <section className="text-center py-14 px-6">
        <span className="inline-block bg-teal-100 text-teal-700 text-xs font-semibold px-3 py-1 rounded-full mb-4">
          {T.badge}
        </span>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] text-gray-900 mb-4">
          {isIndividual ? T.titleIndividual : T.title}
        </h1>
        <p className="text-gray-500 text-lg max-w-xl mx-auto">
          {isIndividual ? T.subtitleIndividual : T.subtitle}
        </p>
      </section>

      {/* Audience switch */}
      <div className="flex flex-col items-center gap-2 px-6">
        <Tabs value={audience} onValueChange={(v) => setAudience(v as Audience)}>
          <TabsList>
            <TabsTrigger value="individual" className="gap-1.5 px-4">
              <User className="h-4 w-4" />
              {T.audienceIndividual}
            </TabsTrigger>
            <TabsTrigger value="company" className="gap-1.5 px-4">
              <Building2 className="h-4 w-4" />
              {T.audienceCompany}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-gray-400 text-center max-w-md">
          {isIndividual ? T.audienceIndividualHint : T.audienceCompanyHint}
        </p>
      </div>

      {/* Plans */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        {/* Four cards inside max-w-6xl leaves ~258px each, so the padding that
            was comfortable at three columns now eats a quarter of the width and
            is what pushed the prices onto two lines. Two cards get the same
            treatment in reverse: stretched across the full width they read as a
            table with two columns missing, so the individual grid is narrowed
            instead of letting the cards grow. */}
        <div className={cn(
          "grid gap-5",
          isIndividual ? "sm:grid-cols-2 max-w-2xl mx-auto" : "md:grid-cols-2 lg:grid-cols-4",
        )}>
          {PLAN_COPY.map((plan, idx) => {
            // The copy lives in i18n.ts and the keys live here, so the two can
            // drift. Rendering nothing is the safe end of that: a card with no
            // key would fall through to the paid branches and sell whatever the
            // fallback happens to be.
            const key: PlanKey | undefined = PLAN_KEYS[idx];
            if (!key) return null;
            const isFree = key === "starter";
            // One highlighted card per tab — the one most visitors on that tab
            // should buy. On the individual tab that is Personal, which is also
            // the only paid card there; leaving the highlight on Professional
            // would mark nothing, since Professional is not on this tab at all.
            const isPopular = isIndividual ? key === "personal" : key === "professional";
            const isCustom = key === "custom";
            const hasPromo = HAS_PROMO[key] ?? false;
            return (
            <div key={plan.name} className={cn("rounded-2xl border-2 p-6 flex flex-col relative",
              isPopular ? "border-teal-500 shadow-teal-100 shadow-xl"
                : key === "enterprise" ? "border-teal-700"
                : isCustom ? "border-gray-900"
                : "border-hairline"
            )}>
              {isPopular && (
                // The badge is positioned with left-1/2, and `translate` does
                // not feed back into layout — so an auto-width absolute box can
                // only use the half of the card to its right. At four columns
                // that is ~129px and "Paling Populer" broke across two lines
                // straddling the card border. w-max sizes it to its own text,
                // and nowrap keeps it there whatever the label says.
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-max">
                  <span className="bg-teal-600 text-white text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1 whitespace-nowrap">
                    <Zap className="h-3 w-3 shrink-0" />{T.popular}
                  </span>
                </div>
              )}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                  {hasPromo && (
                    <span className="text-xs font-bold bg-orange-100 text-orange-600 border border-orange-200 rounded-full px-2 py-0.5">
                      {T.discountBadge}
                    </span>
                  )}
                </div>
                <p className="text-gray-500 text-sm mb-3">{plan.desc}</p>
                {/* The amount and its unit stack instead of sitting side by
                    side. Beside each other they competed for a ~210px line, and
                    both lost: "Rp 200.000" split after "Rp", and on the Custom
                    card the note ran past the card's edge. `whitespace-nowrap`
                    keeps a price from ever breaking mid-number. */}
                {hasPromo ? (
                  <div>
                    {/* "—" rather than an empty span if a key ever lacks a
                        price: a blank where a number belongs looks like a
                        loading bug, and reads as free. */}
                    <span className="text-sm text-gray-400 line-through">{ORIGINAL_PRICES[key] ?? "—"}</span>
                    <div className="flex flex-col mt-0.5">
                      <span className="text-3xl font-bold text-orange-500 whitespace-nowrap">{PROMO_PRICES[key] ?? "—"}</span>
                      <span className="text-gray-400 text-sm">/ {T.perMonth}</span>
                    </div>
                  </div>
                ) : isCustom ? (
                  // No number here on purpose: this tier is sized against the
                  // organisation before any price is quoted. Words need a
                  // smaller size than a figure does — at text-3xl "Sesuai
                  // Kebutuhan" wrapped and dragged the feature list out of line
                  // with the other three cards.
                  <div className="flex flex-col">
                    <span className="text-2xl font-bold text-gray-900 leading-snug">{T.customPrice}</span>
                    <span className="text-gray-400 text-sm">{T.customPriceNote}</span>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <span className="text-3xl font-bold text-gray-900 whitespace-nowrap">{isFree ? T.free : ORIGINAL_PRICES[key] ?? "—"}</span>
                    <span className="text-gray-400 text-sm">/ {isFree ? T.forever : T.perMonth}</span>
                  </div>
                )}
              </div>
              <ul className="space-y-3 flex-1 mb-6">
                {FEATURES[idx].map((f, fi) => {
                  const checkedCount = isFree ? 5 : FEATURES[idx].length;
                  const hasCheck = fi < checkedCount;
                  const isGray = fi >= checkedCount;
                  return (
                    // items-start, not items-center: at this width half these
                    // lines wrap, and a centred tick floats into the gap between
                    // the two lines instead of marking the item it belongs to.
                    <li key={fi} className="flex items-start gap-2.5 text-sm">
                      {hasCheck
                        ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        : <XCircle className="h-4 w-4 text-gray-200 shrink-0 mt-0.5" />}
                      <span className={cn("leading-snug", isGray ? "text-gray-300" : "text-gray-700")}>{f}</span>
                    </li>
                  );
                })}
              </ul>
              {isFree ? (
                // The free card carries the tab with it. Without the hint the
                // register page opens on Company, and someone who came from the
                // individual side would have to notice and switch back — for a
                // choice that cannot be undone afterwards.
                <Link href={isIndividual ? "/register?type=individual" : "/register"}>
                  <Button variant="outline" className="w-full gap-2">
                    {T.startFree} <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              ) : isCustom ? (
                // Deliberately not a checkout: this tier is agreed in a
                // conversation, so the only action on the card is starting one.
                <a href={consultationMailto(lang)}>
                  <Button className="w-full gap-2 bg-gray-900 hover:bg-gray-800">
                    {T.contactUs} <ArrowRight className="h-4 w-4" />
                  </Button>
                </a>
              ) : mounted && session?.user ? (
                <Button
                  className={cn("w-full gap-2", isPopular ? "bg-teal-600 hover:bg-teal-700" : "bg-teal-700 hover:bg-teal-800")}
                  // Not `key === "professional" ? … : "enterprise"` — that is
                  // the same "everything else is Enterprise" fallback this page
                  // was just rid of, one edit away from selling the wrong plan.
                  onClick={() => { if (isPurchasablePlan(key)) handlePay(key); }}
                  disabled={loadingPlan !== null}
                >
                  {loadingPlan === key
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Memproses...</>
                    : <>{isPopular ? T.trialFree : T.contactSales} <ArrowRight className="h-4 w-4" /></>
                  }
                </Button>
              ) : (
                <Link href={`/register?plan=${key}`}>
                  <Button className={cn("w-full gap-2", isPopular ? "bg-teal-600 hover:bg-teal-700" : "bg-teal-700 hover:bg-teal-800")}>
                    {isPopular ? T.trialFree : T.contactSales} <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
            );
          })}
        </div>
      </section>

      {/* Fair use footnote */}
      <div className="max-w-6xl mx-auto px-6 pb-6 flex items-start gap-1.5">
        {T.fairUseNote && <Info className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />}
        {T.fairUseNote && <p className="text-xs text-gray-400">{T.fairUseNote}</p>}
      </div>

      {/* Feature grid */}
      <section className="bg-sunken py-14 px-6">
        <div className="max-w-5xl mx-auto text-center mb-10">
          <h2 className="text-xl md:text-2xl font-semibold tracking-[-0.01em] text-gray-900 mb-2">{T.allFeatures}</h2>
          <p className="text-gray-500">{T.allFeaturesDesc}</p>
        </div>
        <div className="max-w-5xl mx-auto grid sm:grid-cols-2 md:grid-cols-3 gap-6">
          {T.featureGrid.map((f, i) => {
            const Icon = FEATURE_ICONS[i];
            return (
              <div key={i} className="bg-raised rounded-xl p-6 border border-hairline">
                <div className="p-2 bg-teal-50 rounded-lg w-fit mb-3">
                  <Icon className="h-5 w-5 text-teal-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
                <p className="text-gray-500 text-sm">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-xl md:text-2xl font-semibold tracking-[-0.01em] text-gray-900 text-center mb-8">{T.faqTitle}</h2>
        <div className="space-y-6">
          {T.faqs.map((faq) => (
            <div key={faq.q} className="border-b pb-6">
              <h3 className="font-semibold text-gray-900 mb-2">{faq.q}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-teal-700 to-[#061C24] py-16 px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.015em] text-white mb-3">{T.ctaTitle}</h2>
        <p className="text-teal-100 mb-8">{T.ctaDesc}</p>
        <Link href="/register">
          <Button size="lg" className="bg-white text-teal-600 hover:bg-teal-50 gap-2 font-semibold">
            {T.ctaBtn} <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
      </section>

      <SiteFooter lang={lang} />
    </div>
  );
}
