import { getTranslations } from "next-intl/server";
import {
  buildLandingGraph,
  type FaqEntry,
  type PricingPlan,
} from "@/lib/seo/structured-data";
import { LANDING_PLANS } from "@/components/landing/landing-plans";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

// Server component: emits the landing page's schema.org graph
// (Organization + WebSite + SoftwareApplication + FAQPage) as a single
// JSON-LD script. The FAQ content is the same message data the visible
// landing sections render. The 3 self-serve plans' `price` is the same
// "own Meta account" monthly price the visible pricing cards show
// (landing-plans.ts), so the structured data matches the page. Enterprise
// (contact-us) has no fixed price, so it keeps the message file's static
// label ("Customizado"/"Custom").
export async function LandingJsonLd() {
  const [seo, landing] = await Promise.all([
    getTranslations("Seo"),
    getTranslations("LandingV2"),
  ]);

  const faq = (landing.raw("faq.items") as FaqEntry[]) ?? [];
  const plans = (
    (landing.raw("pricing.plans") as { tier: string; name: string; desc?: string; price?: string }[]) ?? []
  ).map((plan): PricingPlan => {
    const landingPlan = LANDING_PLANS.find((p) => p.tier === plan.tier.toLowerCase());
    const price = landingPlan ? BRL.format(landingPlan.ownCents / 100) : (plan.price ?? "");
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
