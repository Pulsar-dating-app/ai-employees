import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { BadgeCheckIcon } from "@/components/ui/icons";

export type TeamAgentStatus = "active" | "paused" | "available";

export type TeamAgent = {
  slug: string;
  name: string;
  role: string;
  description: string;
  photoSrc: string | null;
  status: TeamAgentStatus;
};

// Portrait column — a real photo where one exists (`public/agents/<slug>-*.png`);
// otherwise the authored silhouette on a soft role tint, the same mark this
// card's own status pill sits on top of, so a photo-less agent still reads
// as deliberate. The panel is portrait (taller than wide), so `object-cover`
// on the square source portraits trims a little off the sides, never the face.
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

// Color means "actually running," not "exists" -- active gets the one
// positive tint; paused and available (never hired) share the same neutral
// color, since a never-hired agent isn't more "alive" than a paused one.
// The label text is what tells the three states apart, not the dot color.
function StatusPill({ status, label }: { status: TeamAgentStatus; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-lowest/90 px-2.5 py-1 text-label-sm font-semibold text-on-surface-variant shadow-level1 backdrop-blur">
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === "active" ? "bg-tertiary-container" : "bg-on-surface-variant"}`}
      />
      {label}
    </span>
  );
}

// One card per real, active row in `agents`, used by every state on the
// unified My Team page -- the roster is dynamic over the database, not a
// fixed set of three hardcoded cards. Horizontal layout: portrait on the
// left, details on the right, so a square character portrait shows the
// whole face instead of being cropped into a short wide banner.
//
// `agent.name`/`agent.photoSrc` are resolved by the caller (the page), not
// here: a hired agent's card should show the merchant's own custom
// name/photo (`company_agents.name` / `resolveAgentPhoto(...)`), while a
// not-yet-hired one falls back to the generic default (`defaultAgentName`/
// `agentPhoto`) since there's no company_agents row yet to read from.
export function TeamAgentCard({
  agent,
  billingActive,
  style,
}: {
  agent: TeamAgent;
  billingActive: boolean;
  style?: React.CSSProperties;
}) {
  const t = useTranslations("MyAgents");
  const isHired = agent.status !== "available";
  const href = isHired ? `/dashboard/my-agents/${agent.slug}` : `/dashboard/agents/${agent.slug}`;
  const statusLabel =
    agent.status === "active" ? t("activeBadge") : agent.status === "paused" ? t("pausedBadge") : t("availableBadge");

  return (
    <Link
      href={href}
      style={style}
      className="animate-fade-up flex overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-level1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-level2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <div className="relative w-[38%] min-w-[130px] max-w-[200px] shrink-0">
        <PortraitPanel photoSrc={agent.photoSrc} name={agent.name} />
        <div className="absolute left-3 top-3">
          <StatusPill status={agent.status} label={statusLabel} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-on-surface">{agent.name}</h3>
            <p className="text-sm font-medium text-primary">{agent.role}</p>
          </div>
          {isHired ? <BadgeCheckIcon className="mt-1 h-5 w-5 shrink-0 text-primary" /> : null}
        </div>

        {agent.description ? (
          <p className="line-clamp-3 flex-1 text-sm text-on-surface-variant">{agent.description}</p>
        ) : null}

        {!isHired ? (
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-outline-variant/60 pt-4">
            <span className="text-sm font-semibold text-on-surface">
              {billingActive ? t("includedInPlan") : t("needsPlan")}
            </span>
            <span className="inline-flex h-9 items-center justify-center rounded-md border border-outline-variant bg-surface-container px-4 text-sm font-medium text-on-surface">
              {t("viewDetails")}
            </span>
          </div>
        ) : null}
      </div>
    </Link>
  );
}
