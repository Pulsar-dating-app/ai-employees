import { getTranslations } from "next-intl/server";
import {
  buildLandingGraph,
  type FaqEntry,
  type PricingPlan,
} from "@/lib/seo/structured-data";
import { getPlan, type PlanTier } from "@/lib/billing/plans";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

const SELF_SERVE_TIERS: readonly PlanTier[] = ["starter", "intermediate", "pro"];

// Server component: emits the landing page's schema.org graph
// (Organization + WebSite + SoftwareApplication + FAQPage) as a single
// JSON-LD script. The FAQ content is the same message data the visible
// landing sections render. The 3 self-serve plans' `price` no longer comes
// from the message file (2026-09-17 -- the visible pricing cards now price
// off the real catalog too, see pricing-section.tsx) -- it's resolved here
// from `plans.ts`'s plain monthly variant instead, so the structured data
// shows the real price rather than a fabricated one. Enterprise (contact-us)
// still has no catalog price, so it keeps the message file's static label
// ("Customizado"/"Custom").
export async function LandingJsonLd() {
  const [seo, landing] = await Promise.all([
    getTranslations("Seo"),
    getTranslations("LandingV2"),
  ]);

  const faq = (landing.raw("faq.items") as FaqEntry[]) ?? [];
  const plans = (
    (landing.raw("pricing.plans") as { tier: string; name: string; desc?: string; price?: string }[]) ?? []
  ).map((plan): PricingPlan => {
    const tier = plan.tier.toLowerCase() as PlanTier;
    const price = SELF_SERVE_TIERS.includes(tier)
      ? BRL.format(getPlan(tier).priceBrlCents! / 100)
      : (plan.price ?? "");
    return { name: plan.name, desc: plan.desc, price };
  });

  const graph = buildLandingGraph({
    siteName: seo("siteName"),
    description: seo("description"),
    plans,
    faq,
  });

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe to inline; no user input flows in here.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
