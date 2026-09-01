import Link from "next/link";
import { getTranslations } from "next-intl/server";
import clsx from "clsx";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { BadgeCheckIcon, CalendarIcon, ChevronRightIcon } from "@/components/ui/icons";

// The Stitch screen's right-hand rail, card for card: "Today's Overview"
// (two stat tiles) and the persona card under it. Same chrome constant as
// the booking cards — that screen's hairlines are lighter than <Card>'s.
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
  showCalendarNudge = false,
}: {
  bookedToday: number;
  completedToday: number;
  teamMember: SchedulingTeamMember | null;
  showCalendarNudge?: boolean;
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

      {/* Google Calendar isn't connected — one tap to the K2 card, which the
          #google-calendar anchor scrolls straight to. */}
      {showCalendarNudge ? (
        <Link
          href="/dashboard/scheduling/settings#google-calendar"
          className={clsx(
            RAIL_CARD_CLASSES,
            "group flex items-center gap-3 p-4 transition-colors hover:border-outline-variant/60 hover:bg-surface-container-low",
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
            <CalendarIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-label-md font-semibold text-on-surface">{t("calendarNudgeTitle")}</p>
            <p className="text-label-sm text-on-surface-variant">{t("calendarNudgeBody")}</p>
          </div>
          <ChevronRightIcon className="h-4 w-4 shrink-0 text-on-surface-variant transition-transform group-hover:translate-x-0.5" />
        </Link>
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
