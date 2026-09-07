import { getTranslations } from "next-intl/server";
import {
  buildLandingGraph,
  type FaqEntry,
  type PricingPlan,
} from "@/lib/seo/structured-data";

// Server component: emits the landing page's schema.org graph
// (Organization + WebSite + SoftwareApplication + FAQPage) as a single
// JSON-LD script. The FAQ and pricing content is the same message data the
// visible landing sections render, so the structured data never drifts from
// the page.
export async function LandingJsonLd() {
  const [seo, landing] = await Promise.all([
    getTranslations("Seo"),
    getTranslations("LandingV2"),
  ]);

  const faq = (landing.raw("faq.items") as FaqEntry[]) ?? [];
  const plans = ((landing.raw("pricing.plans") as { name: string; desc?: string; price: string }[]) ?? []).map(
    (plan): PricingPlan => ({ name: plan.name, desc: plan.desc, price: plan.price }),
  );

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
