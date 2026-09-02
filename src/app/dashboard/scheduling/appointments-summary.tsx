import { getTranslations } from "next-intl/server";
import clsx from "clsx";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { BadgeCheckIcon } from "@/components/ui/icons";

// The Stitch screen's right-hand rail, card for card: "Today's Overview"
// (two stat tiles) and the persona card under it. Same chrome constant as
// the booking cards — that screen's hairlines are lighter than <Card>'s.
//
// The Google Calendar "not connected" nudge that used to live here as a
// third rail card moved to page.tsx's `alerts` (rendered above the whole
// grid, alongside the business-hours/intake-questions warnings) — one
// consistent banner treatment for all three missing-config states instead
// of Calendar getting its own differently-styled card.
const RAIL_CARD_CLASSES =
  "rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-level1";

export type SchedulingTeamMember = {
  name: string;
  photoSrc: string | null;
  isActive: boolean;
};

export async function AppointmentsSummary({
  bookedToday,
  completedToday,
  teamMember,
}: {
  bookedToday: number;
  completedToday: number;
  teamMember: SchedulingTeamMember | null;
}) {
  const t = await getTranslations("Scheduling.appointments.summary");

  return (
    <>
      <div className={clsx(RAIL_CARD_CLASSES, "p-6")}>
        <h3 className="mb-4 text-label-md font-semibold text-on-surface">{t("todayTitle")}</h3>
        <div className="grid grid-cols-2 gap-4">
          <StatTile value={bookedToday} label={t("bookedToday")} tone="primary" />
          <StatTile value={completedToday} label={t("completedToday")} tone="tertiary" />
        </div>
      </div>

      {/* The mock's persona card. Its copy ("Active Agent", "Verified
          Human-Centric AI") is the one thing not reproduced literally —
          merchant-facing copy never says "agent" or "AI" (spec §4/§28) — and
          the status is this company's real one, not the mock's "In Meeting". */}
      {teamMember ? (
        <div className={clsx(RAIL_CARD_CLASSES, "overflow-hidden")}>
          <div className="flex items-center justify-between border-b border-outline-variant/20 p-5">
            <h3 className="text-label-md font-semibold text-on-surface">{t("teamTitle")}</h3>
            <span className="relative flex h-3 w-3">
              {teamMember.isActive ? (
                <>
                  <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-secondary opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-secondary" />
                </>
              ) : (
                <span className="relative inline-flex h-3 w-3 rounded-full bg-outline-variant" />
              )}
            </span>
          </div>

          <div className="flex items-center gap-4 p-5">
            <AgentAvatar
              role="intent"
              size="ml"
              shape="circle"
              photoSrc={teamMember.photoSrc}
              alt={teamMember.name}
              className="border-2 border-surface shadow-sm"
            />
            <div>
              <h4 className="text-body-lg font-semibold text-on-surface">{teamMember.name}</h4>
              <div className="mt-1 flex items-center gap-1 text-label-sm text-on-surface-variant">
                <BadgeCheckIcon className="h-3.5 w-3.5 text-primary" />
                <span>{t("verified")}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-outline-variant/20 bg-surface-container-low p-4">
            <div className="flex items-center justify-between text-label-sm">
              <span className="text-on-surface-variant">{t("currentStatus")}</span>
              <span
                className={clsx(
                  "rounded px-2 py-0.5 font-semibold",
                  teamMember.isActive
                    ? "bg-secondary-container/20 text-secondary"
                    : "bg-surface-container text-on-surface-variant",
                )}
              >
                {teamMember.isActive ? t("statusActive") : t("statusPaused")}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function StatTile({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "primary" | "tertiary";
}) {
  return (
    <div className="rounded-lg border border-outline-variant/20 bg-surface-container-low p-4">
      <span
        className={clsx(
          "block text-headline-lg font-bold",
          tone === "primary" ? "text-primary" : "text-tertiary",
        )}
      >
        {value}
      </span>
      <span className="text-label-sm text-on-surface-variant">{label}</span>
    </div>
  );
}
