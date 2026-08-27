import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/agents/agent-avatar";

export type MarketplaceAgent = {
  slug: string;
  name: string;
  role: string;
  description: string;
  traits: string[];
  monthlyPriceBRL: number;
  isHired: boolean;
  photoSrc: string | null;
};

function PhotoPanel({ photoSrc, name, className }: { photoSrc: string | null; name: string; className: string }) {
  return (
    <div className={`relative overflow-hidden bg-surface-container ${className}`}>
      {photoSrc ? (
        <Image src={photoSrc} alt={name} fill sizes="(min-width:1024px) 33vw, 100vw" className="object-cover object-top" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <AgentAvatar role="intent" size="lg" />
        </div>
      )}
    </div>
  );
}

function TraitChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-surface-container-low px-2 py-1 text-label-sm font-semibold text-on-surface-variant">
      {children}
    </span>
  );
}

function StatusPill({ hired, hiredLabel, availableLabel }: { hired: boolean; hiredLabel: string; availableLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1 text-label-sm font-semibold text-on-surface-variant">
      <span className="h-2 w-2 rounded-full bg-tertiary-container" />
      {hired ? hiredLabel : availableLabel}
    </span>
  );
}

// One card per real, active row in `agents` — the marketplace is dynamic
// over the database, not a fixed roster. Traits come from AGENT_ENRICHMENT
// where a curated entry exists; an agent with none renders without chips,
// never fabricated. `prominent` renders the Stitch hero card (image-left,
// two actions); otherwise the standard image-top card.
export function HireableAgentCard({
  agent,
  prominent = false,
  style,
}: {
  agent: MarketplaceAgent;
  prominent?: boolean;
  style?: React.CSSProperties;
}) {
  const t = useTranslations("Marketplace");
  const tDetail = useTranslations("AgentDetail");
  const href = `/dashboard/agents/${agent.slug}`;

  if (prominent) {
    return (
      <article
        style={style}
        className="animate-fade-up flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-level1 md:flex-row lg:col-span-2"
      >
        <PhotoPanel photoSrc={agent.photoSrc} name={agent.name} className="h-56 md:h-auto md:w-2/5" />
        <div className="flex flex-1 flex-col gap-4 p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-headline-md font-bold text-on-surface">{agent.name}</h2>
              <p className="text-body-md font-medium text-primary">{agent.role}</p>
            </div>
            <StatusPill hired={agent.isHired} hiredLabel={t("hiredBadge")} availableLabel={t("availableBadge")} />
          </div>
          {agent.description ? (
            <p className="flex-1 text-body-md text-on-surface-variant">{agent.description}</p>
          ) : null}
          {agent.traits.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {agent.traits.map((trait) => (
                <TraitChip key={trait}>{trait}</TraitChip>
              ))}
            </div>
          ) : null}
          {/* Both actions lead to the detail page, where hiring happens. */}
          <div className="mt-auto flex flex-wrap gap-3">
            <Link
              href={href}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-on-primary transition-colors hover:brightness-90"
            >
              {agent.isHired ? t("viewDetails") : tDetail("hireButton", { name: agent.name })}
            </Link>
            <Link
              href={href}
              className="inline-flex h-12 items-center justify-center rounded-md border border-outline-variant bg-surface-container px-6 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-high"
            >
              {t("viewDetails")}
            </Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <Link
      href={href}
      style={style}
      className="animate-fade-up flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-level1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-level2"
    >
      <PhotoPanel photoSrc={agent.photoSrc} name={agent.name} className="h-48" />
      <div className="flex flex-1 flex-col gap-3 p-6">
        <div>
          <h3 className="text-xl font-bold text-on-surface">{agent.name}</h3>
          <p className="text-sm font-medium text-primary">{agent.role}</p>
        </div>
        {agent.description ? (
          <p className="line-clamp-3 flex-1 text-sm text-on-surface-variant">{agent.description}</p>
        ) : null}
        {agent.traits.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {agent.traits.slice(0, 2).map((trait) => (
              <TraitChip key={trait}>{trait}</TraitChip>
            ))}
          </div>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-on-surface">
            {agent.isHired ? t("hiredBadge") : t("priceLabel", { price: agent.monthlyPriceBRL })}
          </span>
          <span className="inline-flex h-9 items-center justify-center rounded-md border border-outline-variant bg-surface-container px-4 text-sm font-medium text-on-surface">
            {t("viewDetails")}
          </span>
        </div>
      </div>
    </Link>
  );
}
