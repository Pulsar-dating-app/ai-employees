import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { BadgeCheckIcon } from "@/components/ui/icons";
import { MOCK_CONVERSATIONS_TODAY } from "@/lib/agents/catalog";
import { resolveAgentDescription } from "@/lib/agents/copy";

// "My Agents" persona card — portrait on the left, details on the right, an
// active pill, verified chip, description, and a one-row stat strip. Used
// both on the my-team list and (full width) on the per-agent configuration
// page. The portrait column is taller than it is wide, so `object-cover` on
// the square source portraits only trims the sides, never the face.
export async function AgentPersonaCard({
  slug,
  name,
  role,
  description,
  photoSrc,
  active,
  className,
}: {
  // When given, the localised per-slug blurb is used, falling back to
  // `description` (the DB value) only if none is authored.
  slug?: string;
  name: string;
  role: string | null;
  description: string | null;
  photoSrc: string | null;
  active: boolean;
  className?: string;
}) {
  const t = await getTranslations("MyAgents");
  const blurb = slug
    ? await resolveAgentDescription(slug, description, name)
    : (description ?? "");

  return (
    <div
      className={`flex overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-level1 ${className ?? ""}`}
    >
      <div className="relative w-[38%] min-w-[120px] max-w-[190px] shrink-0 bg-surface-container">
        {photoSrc ? (
          <Image
            src={photoSrc}
            alt={name}
            fill
            sizes="(min-width:1024px) 190px, 40vw"
            className="object-cover object-[center_35%]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <AgentAvatar role="intent" size="lg" />
          </div>
        )}
        {active ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-surface-container-lowest/90 px-3 py-1 text-label-sm font-semibold text-tertiary-container backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-tertiary-container" />
            {t("activeBadge")}
          </span>
        ) : (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-surface-container-lowest/90 px-3 py-1 text-label-sm font-semibold text-on-surface-variant backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-on-surface-variant" />
            {t("pausedBadge")}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-on-surface">{name}</h3>
            <p className="text-sm font-medium text-primary">{role}</p>
          </div>
          <BadgeCheckIcon className="mt-1 h-5 w-5 shrink-0 text-primary" />
        </div>

        {blurb ? (
          <p className="line-clamp-3 flex-1 text-sm text-on-surface-variant">{blurb}</p>
        ) : null}

        <div className="flex items-center justify-between border-t border-outline-variant pt-4 text-sm">
          <span className="text-on-surface-variant">{t("conversationsToday")}</span>
          <span className="font-semibold text-on-surface">{MOCK_CONVERSATIONS_TODAY}</span>
        </div>
      </div>
    </div>
  );
}
