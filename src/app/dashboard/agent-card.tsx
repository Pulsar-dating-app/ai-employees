import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/agents/agent-avatar";

export type MarketplaceAgent = {
  slug: string;
  name: string;
  role: string;
  description: string;
  monthlyPriceBRL: number;
  isHired: boolean;
  photoSrc: string | null;
};

// Portrait area. A real photo where one exists (`public/agents/<slug>.jpg`);
// otherwise a placeholder — the authored silhouette on a soft role tint, the
// same mark My Team's persona cards use, so a photo-less agent still reads as
// deliberate rather than unfinished.
function PortraitPanel({ photoSrc, name }: { photoSrc: string | null; name: string }) {
  return (
    <div className="relative h-48 overflow-hidden bg-surface-container">
      {photoSrc ? (
        <Image
          src={photoSrc}
          alt={name}
          fill
          sizes="(min-width:1024px) 30vw, (min-width:768px) 45vw, 100vw"
          className="object-cover object-top"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-fixed via-primary-fixed to-surface-container-high">
          <AgentAvatar role="intent" size="lg" className="scale-150" />
        </div>
      )}
    </div>
  );
}

function StatusPill({ hired, label }: { hired: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-lowest/90 px-2.5 py-1 text-label-sm font-semibold text-on-surface-variant shadow-level1 backdrop-blur">
      <span className={`h-1.5 w-1.5 rounded-full ${hired ? "bg-on-surface-variant" : "bg-tertiary-container"}`} />
      {label}
    </span>
  );
}

// One card per real, active row in `agents` — the marketplace is dynamic
// over the database, not a fixed roster, and every agent gets the *same*
// card (no hero/prominent variant): with a two- or three-person roster an
// asymmetric layout just reads as "this one matters more".
export function HireableAgentCard({
  agent,
  style,
}: {
  agent: MarketplaceAgent;
  style?: React.CSSProperties;
}) {
  const t = useTranslations("Marketplace");

  return (
    <Link
      href={`/dashboard/agents/${agent.slug}`}
      style={style}
      className="animate-fade-up flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-level1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-level2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <div className="relative">
        <PortraitPanel photoSrc={agent.photoSrc} name={agent.name} />
        <div className="absolute left-3 top-3">
          <StatusPill
            hired={agent.isHired}
            label={agent.isHired ? t("hiredBadge") : t("availableBadge")}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-6">
        <div>
          <h3 className="text-xl font-bold text-on-surface">{agent.name}</h3>
          <p className="text-sm font-medium text-primary">{agent.role}</p>
        </div>

        {agent.description ? (
          <p className="line-clamp-3 flex-1 text-sm text-on-surface-variant">{agent.description}</p>
        ) : null}

        <div className="mt-2 flex items-center justify-between gap-3 border-t border-outline-variant/60 pt-4">
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
