import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/agents/agent-avatar";

export type MarketplaceAgent = {
  slug: string;
  name: string;
  role: string;
  description: string;
  isHired: boolean;
  photoSrc: string | null;
};

// Portrait column — a real photo where one exists (`public/agents/<slug>-*.png`);
// otherwise the authored silhouette on a soft role tint, the same mark My
// Team's persona cards use, so a photo-less agent still reads as deliberate.
// The panel is portrait (taller than wide), so `object-cover` on the square
// source portraits trims a little off the sides, never the face.
function PortraitPanel({ photoSrc, name }: { photoSrc: string | null; name: string }) {
  return (
    <div className="absolute inset-0 bg-surface-container">
      {photoSrc ? (
        <Image
          src={photoSrc}
          alt={name}
          fill
          sizes="(min-width:640px) 180px, 40vw"
          className="object-cover object-[center_35%]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-fixed via-primary-fixed to-surface-container-high">
          <AgentAvatar role="intent" size="lg" />
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
// card. Horizontal layout: portrait on the left, details on the right, so a
// square character portrait shows the whole face instead of being cropped
// into a short wide banner.
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
      className="animate-fade-up flex overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-level1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-level2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <div className="relative w-[38%] min-w-[130px] max-w-[200px] shrink-0">
        <PortraitPanel photoSrc={agent.photoSrc} name={agent.name} />
        <div className="absolute left-3 top-3">
          <StatusPill
            hired={agent.isHired}
            label={agent.isHired ? t("hiredBadge") : t("availableBadge")}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h3 className="text-xl font-bold text-on-surface">{agent.name}</h3>
          <p className="text-sm font-medium text-primary">{agent.role}</p>
        </div>

        {agent.description ? (
          <p className="line-clamp-3 flex-1 text-sm text-on-surface-variant">{agent.description}</p>
        ) : null}

        <div className="mt-1 flex items-center justify-between gap-3 border-t border-outline-variant/60 pt-4">
          <span className="text-sm font-semibold text-on-surface">
            {agent.isHired ? t("hiredBadge") : t("includedInPlan")}
          </span>
          <span className="inline-flex h-9 items-center justify-center rounded-md border border-outline-variant bg-surface-container px-4 text-sm font-medium text-on-surface">
            {t("viewDetails")}
          </span>
        </div>
      </div>
    </Link>
  );
}
