import Link from "next/link";
import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { CARD_SHADOW, CARD_SHADOW_HOVER } from "@/components/ui/card";

function TraitChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
      {children}
    </span>
  );
}

// One card per real, active row in `agents` — the marketplace is dynamic
// over the database, not a fixed roster (see dashboard/page.tsx). Traits
// come from AGENT_ENRICHMENT when a curated entry exists for this slug;
// an agent with none just renders without the chip row, never fabricated.
export function HireableAgentCard({
  slug,
  name,
  role,
  traits,
  monthlyPriceBRL,
  isHired,
  style,
}: {
  slug: string;
  name: string;
  role: string;
  traits: string[];
  monthlyPriceBRL: number;
  isHired: boolean;
  style?: React.CSSProperties;
}) {
  const t = useTranslations("Marketplace");

  return (
    <Link
      href={`/dashboard/agents/${slug}`}
      style={style}
      className={`animate-fade-up flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-400 ${CARD_SHADOW} ${CARD_SHADOW_HOVER}`}
    >
      <div className="flex items-start gap-4">
        <AgentAvatar role="intent" size="lg" />
        <div className="flex flex-col gap-1">
          <span className="text-base font-semibold text-neutral-900">{name}</span>
          <span className="text-sm text-neutral-500">{role}</span>
        </div>
      </div>

      {traits.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {traits.map((trait) => (
            <TraitChip key={trait}>{trait}</TraitChip>
          ))}
        </div>
      ) : null}

      {isHired ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success-100 px-2.5 py-1 text-xs font-semibold text-success-500">
          {t("hiredBadge")}
        </span>
      ) : (
        <span className="text-sm font-semibold text-neutral-900">
          {t("priceLabel", { price: monthlyPriceBRL })}
        </span>
      )}
    </Link>
  );
}
