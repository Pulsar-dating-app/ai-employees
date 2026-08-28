import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { ActivityIcon } from "@/components/ui/icons";

export type HealthState = "healthy" | "waiting" | "paused" | "not_hired";

// "Agent Health" — a single honest, derived read on whether the team member
// is actually working: hired? paused? had any conversations in this period?
// Deliberately not "anomaly detection in intent mapping" (the Stitch mock's
// filler copy) — nothing here inspects conversation quality, so it doesn't
// claim to.
const TONE: Record<HealthState, { ring: string; dot: string; badge: string }> = {
  healthy: {
    ring: "border-tertiary-container",
    dot: "bg-tertiary",
    badge: "bg-tertiary-container/15 text-tertiary",
  },
  waiting: {
    ring: "border-primary-container",
    dot: "bg-primary",
    badge: "bg-primary-fixed text-primary",
  },
  paused: {
    ring: "border-outline",
    dot: "bg-on-surface-variant",
    badge: "bg-surface-container-high text-on-surface-variant",
  },
  not_hired: {
    ring: "border-primary-container",
    dot: "bg-primary",
    badge: "bg-primary-fixed text-primary",
  },
};

export function AgentHealthCard({
  state,
  title,
  body,
  cta,
}: {
  state: HealthState;
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  const tone = TONE[state];

  return (
    <div className="flex flex-col items-start gap-6 rounded-xl border border-outline-variant bg-gradient-to-r from-surface-container-low to-surface p-8 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-2">
        <h3 className="text-headline-md font-semibold tracking-tight text-on-surface">{title}</h3>
        <p className="max-w-xl text-body-md text-on-surface-variant">{body}</p>
        {cta ? (
          <Link href={cta.href} className="mt-2">
            <Button type="button" size="sm">
              {cta.label}
            </Button>
          </Link>
        ) : null}
      </div>

      <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
        <span
          className={clsx(
            "absolute inset-0 rounded-full border-2 opacity-20 motion-safe:animate-ping",
            tone.ring,
          )}
        />
        <span className={clsx("absolute inset-4 rounded-full border-2 opacity-40", tone.ring)} />
        <span
          className={clsx(
            "relative z-10 flex h-14 w-14 items-center justify-center rounded-full",
            tone.badge,
          )}
        >
          <ActivityIcon className="h-6 w-6" />
        </span>
        <span
          className={clsx(
            "absolute bottom-2 right-3 z-20 h-3.5 w-3.5 rounded-full border-2 border-surface",
            tone.dot,
          )}
        />
      </div>
    </div>
  );
}
