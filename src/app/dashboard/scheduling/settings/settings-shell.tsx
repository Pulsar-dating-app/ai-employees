"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { CalendarIcon, ClockIcon, LinkIcon, ListIcon, SettingsIcon, WarningIcon } from "@/components/ui/icons";
import { useScrollSpy } from "@/components/ui/use-scroll-spy";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";

export type SectionKey = "business-hours" | "appointment-rules" | "time-off" | "intake-questions" | "google-calendar";

export type SectionStatus = { summary: string; warn: boolean };

const SECTIONS: SectionKey[] = [
  "business-hours",
  "appointment-rules",
  "time-off",
  "intake-questions",
  "google-calendar",
];

const ICONS: Record<SectionKey, (props: React.SVGProps<SVGSVGElement>) => React.ReactElement> = {
  "business-hours": ClockIcon,
  "appointment-rules": SettingsIcon,
  "time-off": CalendarIcon,
  "intake-questions": ListIcon,
  "google-calendar": LinkIcon,
};

const TITLE_KEYS: Record<SectionKey, string> = {
  "business-hours": "businessHours.title",
  "appointment-rules": "approval.title",
  "time-off": "timeOff.title",
  "intake-questions": "intake.title",
  "google-calendar": "googleCalendar.title",
};

const StatusContext = createContext<(key: SectionKey, status: SectionStatus) => void>(() => {});

export function useSectionStatus(key: SectionKey, status: SectionStatus | null) {
  const report = useContext(StatusContext);
  const summary = status?.summary ?? null;
  const warn = status?.warn ?? false;
  useEffect(() => {
    if (summary === null) return;
    report(key, { summary, warn });
  }, [report, key, summary, warn]);
}

type Statuses = Record<SectionKey, SectionStatus>;

function SectionNav({
  statuses,
  active,
  onSelect,
}: {
  statuses: Statuses;
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  const t = useTranslations("Scheduling.settings");
  const { indicatorRef, register } = useSlidingIndicator<HTMLAnchorElement>(active, null, "y");

  return (
    <nav aria-label={t("nav.label")} className="relative flex flex-col">
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className="inbox-indicator absolute left-0 right-0 top-0 rounded-xl bg-surface-container-lowest opacity-0 shadow-[0_1px_3px_rgba(25,28,29,0.12)]"
      />
      {SECTIONS.map((key) => {
        const Icon = ICONS[key];
        const { summary, warn } = statuses[key];
        const isActive = active === key;
        return (
          <a
            key={key}
            ref={register(key)}
            href={`#${key}`}
            onClick={() => onSelect(key)}
            aria-current={isActive ? "true" : undefined}
            className={clsx(
              "group relative z-10 flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            )}
          >
            <Icon
              aria-hidden="true"
              className={clsx(
                "mt-0.5 h-4 w-4 shrink-0 transition-colors duration-200",
                isActive ? "text-primary" : "text-outline group-hover:text-on-surface-variant",
              )}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className={clsx(
                  "text-sm transition-colors duration-200",
                  isActive
                    ? "font-semibold text-on-surface"
                    : "font-medium text-on-surface-variant group-hover:text-on-surface",
                )}
              >
                {t(TITLE_KEYS[key])}
              </span>
              {summary ? (
                <span className={clsx("mt-0.5 text-[12px] leading-4", warn ? "text-orange-700" : "text-outline")}>
                  {summary}
                </span>
              ) : null}
            </span>
            {warn ? (
              <>
                <WarningIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                <span className="sr-only">{t("nav.needsAttention")}</span>
              </>
            ) : null}
          </a>
        );
      })}
    </nav>
  );
}

function MobileNav({
  statuses,
  active,
  onSelect,
}: {
  statuses: Statuses;
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  const t = useTranslations("Scheduling.settings");
  const stripRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const chip = stripRef.current?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    chip?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  return (
    <div className="sticky top-14 z-10 -mx-4 border-b border-outline-variant/50 bg-surface/95 px-4 py-3 backdrop-blur sm:top-16 lg:hidden">
      <nav
        ref={stripRef}
        aria-label={t("nav.label")}
        className="relative -mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SECTIONS.map((key) => {
          const isActive = active === key;
          return (
            <a
              key={key}
              data-chip={key}
              href={`#${key}`}
              onClick={() => onSelect(key)}
              aria-current={isActive ? "true" : undefined}
              className={clsx(
                "relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-200",
                isActive ? "bg-primary-fixed text-primary" : "bg-surface-container text-on-surface",
              )}
            >
              {statuses[key].warn ? (
                <>
                  <WarningIcon aria-hidden="true" className="h-3.5 w-3.5 text-orange-600" />
                  <span className="sr-only">{t("nav.needsAttention")}</span>
                </>
              ) : null}
              {t(TITLE_KEYS[key])}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

export function SchedulingSettingsShell({
  initialStatuses,
  banner,
  children,
}: {
  initialStatuses: Statuses;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Statuses>(initialStatuses);
  const [active, selectSection] = useScrollSpy(SECTIONS);
  const warnRef = useRef<Record<SectionKey, boolean>>(
    Object.fromEntries(SECTIONS.map((k) => [k, initialStatuses[k].warn])) as Record<SectionKey, boolean>,
  );

  const report = useCallback(
    (key: SectionKey, status: SectionStatus) => {
      setStatuses((prev) =>
        prev[key].summary === status.summary && prev[key].warn === status.warn ? prev : { ...prev, [key]: status },
      );
      if (warnRef.current[key] !== status.warn) {
        warnRef.current[key] = status.warn;
        router.refresh();
      }
    },
    [router],
  );

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!SECTIONS.includes(hash as SectionKey)) return;
    const frame = requestAnimationFrame(() => {
      selectSection(hash as SectionKey);
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectSection]);

  return (
    <StatusContext.Provider value={report}>
      {banner}
      <MobileNav statuses={statuses} active={active} onSelect={selectSection} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <SectionNav statuses={statuses} active={active} onSelect={selectSection} />
          </div>
        </aside>
        <div className="flex min-w-0 max-w-4xl flex-col gap-6">{children}</div>
      </div>
    </StatusContext.Provider>
  );
}
