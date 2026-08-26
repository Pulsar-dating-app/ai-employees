import { getTranslations } from "next-intl/server";
import { AGENT_ENRICHMENT } from "@/lib/agents/catalog";
import { Reveal } from "./reveal";
import type { PublicAgent } from "./agents";

// The page's objection handler and the most persuasive content the product
// genuinely owns: the behavioral guarantees from the spec (§6). "Never
// invents a price or stock level" answers the single biggest fear a merchant
// has about letting software talk to their customers. Real spec-sourced
// content via AGENT_ENRICHMENT — nothing invented.
export async function TrustBand({ lead }: { lead: PublicAgent | null }) {
  const t = await getTranslations("Landing.trust");
  const tShould = await getTranslations("AgentDetail.should");
  const tNever = await getTranslations("AgentDetail.never");

  const enrichment = lead ? AGENT_ENRICHMENT[lead.slug] : undefined;
  if (!enrichment) return null;
  const name = lead!.name;

  return (
    <section className="border-y border-[var(--l-line)] bg-[var(--l-sunken)]">
      <div className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <Reveal>
            <h2
              className="text-balance text-[clamp(26px,3vw,36px)] font-bold leading-[1.12] tracking-[-0.028em] text-[var(--l-ink)]"
              style={{ fontFamily: "var(--font-landing-display)" }}
            >
              {t("heading", { name })}
            </h2>
            <p className="mt-4 max-w-[40ch] text-[15px] leading-relaxed text-[var(--l-sub)]">
              {t("sub", { name })}
            </p>
          </Reveal>

          <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
            <Reveal>
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--l-indigo)]">
                {t("doesTitle")}
              </p>
              <ul className="flex flex-col gap-3.5">
                {enrichment.should.map((key) => (
                  <li key={key} className="flex gap-2.5 text-[14px] leading-relaxed text-[var(--l-ink)]">
                    <svg viewBox="0 0 24 24" className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[var(--l-indigo)]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12l5 5L20 6" />
                    </svg>
                    {tShould(key)}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delayMs={90}>
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--l-coral)]">
                {t("neverTitle")}
              </p>
              <ul className="flex flex-col gap-3.5">
                {enrichment.never.map((key) => (
                  <li key={key} className="flex gap-2.5 text-[14px] leading-relaxed text-[var(--l-sub)]">
                    <svg viewBox="0 0 24 24" className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[var(--l-coral)]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                    {tNever(key)}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
