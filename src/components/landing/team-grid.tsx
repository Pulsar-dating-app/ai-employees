import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AGENT_ENRICHMENT } from "@/lib/agents/catalog";
import { AgentMark } from "./agent-mark";
import { Reveal } from "./reveal";
import type { PublicAgent } from "./agents";

export async function TeamGrid({ agents }: { agents: PublicAgent[] }) {
  const t = await getTranslations("Landing.team");
  const tTraits = await getTranslations("Marketplace.traits");

  return (
    <section className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2
              className="text-balance text-[clamp(26px,3vw,36px)] font-bold leading-[1.12] tracking-[-0.028em] text-[var(--l-ink)]"
              style={{ fontFamily: "var(--font-landing-display)" }}
            >
              {t("heading")}
            </h2>
            <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-[var(--l-sub)]">
              {t("sub")}
            </p>
          </div>
          <span className="text-[12px] font-medium tabular-nums text-[var(--l-faint)]">
            {t("count", { count: agents.length })}
          </span>
        </div>
      </Reveal>

      <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[var(--l-line)] bg-[var(--l-line)] sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent, index) => (
          <Reveal key={agent.slug} delayMs={index * 70} className="h-full">
            <article className="group flex h-full flex-col bg-[var(--l-panel)] p-6 transition-colors duration-300 hover:bg-[var(--l-sunken)]">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--l-coral-tint)] text-[var(--l-coral)]">
                  <AgentMark className="h-[22px] w-[22px]" />
                </span>
                <div>
                  <h3
                    className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--l-ink)]"
                    style={{ fontFamily: "var(--font-landing-display)" }}
                  >
                    {agent.name}
                  </h3>
                  <p className="text-[12.5px] text-[var(--l-sub)]">{agent.role}</p>
                </div>
              </div>

              {agent.description ? (
                <p className="mt-4 text-[13.5px] leading-relaxed text-[var(--l-sub)]">
                  {agent.description}
                </p>
              ) : null}

              {/* Traits render only where real spec-sourced content exists
                  for this slug — never invented for an agent without it. */}
              {(AGENT_ENRICHMENT[agent.slug]?.traits ?? []).length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {AGENT_ENRICHMENT[agent.slug].traits.map((trait) => (
                    <span
                      key={trait}
                      className="rounded-md bg-[var(--l-sunken)] px-2 py-1 text-[11px] font-medium text-[var(--l-sub)] transition-colors group-hover:bg-[var(--l-panel)]"
                    >
                      {tTraits(trait)}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-6 flex items-center gap-2 pt-4">
                <span className="l-pulse h-1.5 w-1.5 rounded-full bg-[var(--l-green)]" />
                <span className="text-[11.5px] font-semibold text-[var(--l-green)]">
                  {t("availableBadge")}
                </span>
              </div>
            </article>
          </Reveal>
        ))}

        <Reveal delayMs={agents.length * 70} className="h-full">
          <article className="flex h-full flex-col justify-center bg-[var(--l-panel)] p-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-[var(--l-line)] text-[var(--l-faint)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <h3
              className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-[var(--l-sub)]"
              style={{ fontFamily: "var(--font-landing-display)" }}
            >
              {t("soonTitle")}
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--l-faint)]">
              {t("soonBody")}
            </p>
            <Link
              href="/sign-up"
              className="mt-5 text-[13px] font-semibold text-[var(--l-indigo)] underline-offset-4 hover:underline"
            >
              {t("soonCta")}
            </Link>
          </article>
        </Reveal>
      </div>
    </section>
  );
}
