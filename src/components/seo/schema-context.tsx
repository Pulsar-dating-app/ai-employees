import { getTranslations } from "next-intl/server";
import type { PricingPlan, SiteIdentity } from "@/lib/seo/structured-data";
import { LANDING_PLANS } from "@/components/landing/landing-plans";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

/**
 * What every public page's JSON-LD needs, resolved for the request locale:
 * the site/company identity and the pricing plans.
 *
 * The 3 self-serve plans' price is the same "own Meta account" monthly price
 * the visible pricing cards show (landing-plans.ts), so the structured data
 * matches the page. Enterprise (contact-us) has no fixed price and keeps the
 * message file's static label.
 */
export async function loadSchemaContext(): Promise<{ site: SiteIdentity; plans: PricingPlan[] }> {
  const [seo, brand, landing] = await Promise.all([
    getTranslations("Seo"),
    getTranslations("Brand"),
    getTranslations("LandingV2"),
  ]);

  const plans = (
    (landing.raw("pricing.plans") as { tier: string; name: string; desc?: string; price?: string }[]) ?? []
  ).map((plan): PricingPlan => {
    const landingPlan = LANDING_PLANS.find((p) => p.tier === plan.tier.toLowerCase());
    const price = landingPlan ? BRL.format(landingPlan.ownCents / 100) : (plan.price ?? "");
    return { name: plan.name, desc: plan.desc, price };
  });

  return {
    site: {
      siteName: seo("siteName"),
      siteDescription: seo("description"),
      orgDescription: brand("schemaDescription"),
    },
    plans,
  };
}

/** Renders a JSON-LD graph. JSON.stringify output is safe to inline; only authored copy flows in. */
export function JsonLdScript({ graph }: { graph: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }} />;
}
