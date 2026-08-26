import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AgentMark } from "./agent-mark";
import { ConversationPanel } from "./product-panels";
import type { DemoMessage } from "./whatsapp-thread";
import type { PublicAgent } from "./agents";

// The product surface bleeds off the right edge and sits slightly rotated
// in 3D — the Stripe/Attio move of showing real software mid-use rather
// than a centered, framed picture of it.
export async function Hero({
  lead,
  agents,
  messages,
}: {
  lead: PublicAgent | null;
  agents: PublicAgent[];
  messages: DemoMessage[];
}) {
  const t = await getTranslations("Landing.hero");

  return (
    <section className="relative overflow-hidden border-b border-[var(--l-line)]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 pb-20 pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:gap-10 lg:pb-28 lg:pt-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--l-line)] bg-[var(--l-panel)] py-1 pl-1 pr-3 text-[12px] font-medium text-[var(--l-sub)] shadow-[0_1px_2px_rgba(22,24,29,0.04)]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--l-coral-tint)] text-[var(--l-coral)]">
              <AgentMark className="h-3 w-3" />
            </span>
            {t("badge", { count: agents.length })}
          </span>

          <h1
            className="mt-6 text-balance text-[clamp(36px,4.6vw,58px)] font-bold leading-[1.05] tracking-[-0.033em] text-[var(--l-ink)]"
            style={{ fontFamily: "var(--font-landing-display)" }}
          >
            {t("headline")}
          </h1>

          <p className="mt-5 max-w-[46ch] text-[16.5px] leading-[1.6] text-[var(--l-sub)]">
            {t("subhead")}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/sign-up"
              className="rounded-lg bg-[var(--l-indigo)] px-5 py-3 text-[14.5px] font-semibold text-white shadow-[0_1px_2px_rgba(22,24,29,0.08),0_10px_24px_-12px_rgba(79,70,229,0.7)] transition-all duration-200 hover:-translate-y-px hover:bg-[var(--l-indigo-deep)]"
            >
              {lead ? t("primaryCta", { name: lead.name }) : t("primaryCtaGeneric")}
            </Link>
            <a
              href="#how"
              className="rounded-lg border border-[var(--l-line)] bg-[var(--l-panel)] px-5 py-3 text-[14.5px] font-semibold text-[var(--l-ink)] transition-colors duration-200 hover:border-[var(--l-sub)]"
            >
              {t("secondaryCta")}
            </a>
          </div>

          <p className="mt-5 text-[12.5px] text-[var(--l-faint)]">{t("reassurance")}</p>
        </div>

        {/* Bleeds right, tilted — software in use, not a framed picture. */}
        <div className="relative lg:-mr-[16%]" style={{ perspective: "1600px" }}>
          <div
            className="origin-left"
            style={{ transform: "rotateY(-13deg) rotateX(3deg) rotateZ(-0.6deg)" }}
          >
            <ConversationPanel messages={messages} />
          </div>
        </div>
      </div>
    </section>
  );
}
