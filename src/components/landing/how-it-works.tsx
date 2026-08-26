import { getTranslations } from "next-intl/server";
import { Reveal } from "./reveal";
import { ProductStepper, type StepMeta } from "./product-stepper";
import { MarketplacePanel, KnowledgePanel, ChannelPanel, ConversationPanel } from "./product-panels";
import type { DemoMessage } from "./whatsapp-thread";
import type { PublicAgent } from "./agents";

const STEP_KEYS = ["hire", "teach", "connect", "sell"] as const;

// The panels are rendered server-side (so translations and the live agent
// roster resolve there) and handed to the client stepper as an array — it
// only owns which index is visible.
export async function HowItWorks({
  agents,
  messages,
}: {
  agents: PublicAgent[];
  messages: DemoMessage[];
}) {
  const t = await getTranslations("Landing.howItWorks");

  const steps: StepMeta[] = STEP_KEYS.map((key) => ({
    key,
    title: t(`steps.${key}.title`),
    description: t(`steps.${key}.description`),
  }));

  const panels = [
    <MarketplacePanel key="hire" agents={agents} />,
    <KnowledgePanel key="teach" />,
    <ChannelPanel key="connect" />,
    <ConversationPanel key="sell" messages={messages} />,
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
      <Reveal className="max-w-[52ch]">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--l-indigo)]">
          {t("kicker")}
        </p>
        <h2
          className="text-balance text-[clamp(26px,3vw,36px)] font-bold leading-[1.12] tracking-[-0.028em] text-[var(--l-ink)]"
          style={{ fontFamily: "var(--font-landing-display)" }}
        >
          {t("heading")}
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--l-sub)]">{t("sub")}</p>
      </Reveal>

      <div className="mt-14">
        <ProductStepper steps={steps} panels={panels} />
      </div>
    </section>
  );
}
