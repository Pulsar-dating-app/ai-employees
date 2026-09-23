"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useScrollSpy } from "@/components/ui/use-scroll-spy";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { CartIcon, CheckIcon, ChevronRightIcon } from "@/components/ui/icons";
import { useSlidingIndicator } from "@/components/ui/use-sliding-indicator";
import { StatusBanner } from "@/components/ui/status-banner";

export type SectionKey = "about" | "contact" | "payments" | "faq" | "other";

const SECTIONS: SectionKey[] = ["about", "contact", "payments", "faq", "other"];
const COUNTED: SectionKey[] = ["about", "payments", "faq", "other"];

type FilledState = Record<SectionKey, boolean>;

const FilledContext = createContext<(key: SectionKey, filled: boolean) => void>(() => {});

export function useReportFilled() {
  return useContext(FilledContext);
}

function SectionNav({
  filled,
  active,
  onSelect,
}: {
  filled: FilledState;
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  const t = useTranslations("Settings.nav");
  const done = COUNTED.filter((k) => filled[k]).length;
  const { indicatorRef, register } = useSlidingIndicator<HTMLAnchorElement>(active, null, "y");

  return (
    <nav aria-label={t("label")} className="flex flex-col gap-4">
      <div className="px-3">
        <p className="text-sm font-semibold text-on-surface">
          {t("progress", { filled: done, total: COUNTED.length })}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container-high">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: `${(done / COUNTED.length) * 100}%` }}
          />
        </div>
      </div>
      <div className="relative flex flex-col">
        <span
          ref={indicatorRef}
          aria-hidden="true"
          className="inbox-indicator absolute left-0 right-0 top-0 rounded-xl bg-surface-container-lowest opacity-0 shadow-[0_1px_3px_rgba(25,28,29,0.12)]"
        />
        {SECTIONS.map((key) => {
          const counted = COUNTED.includes(key);
          return (
            <a
              key={key}
              ref={register(key)}
              href={`#${key}`}
              onClick={() => onSelect(key)}
              aria-current={active === key ? "true" : undefined}
              className={clsx(
                "relative z-10 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                active === key
                  ? "font-semibold text-on-surface"
                  : "font-medium text-on-surface-variant hover:text-on-surface",
              )}
            >
              <span
                className={clsx(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
                  !counted
                    ? ""
                    : filled[key]
                      ? "bg-success-100 text-success-500"
                      : "border-2 border-dashed border-outline-variant",
                )}
              >
                {counted && filled[key] ? <CheckIcon className="h-3 w-3" /> : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{t(key)}</span>
                {!counted ? <span className="text-[12px] font-medium text-outline">{t("notCounted")}</span> : null}
              </span>
              {counted ? <span className="sr-only">{filled[key] ? t("filled") : t("missing")}</span> : null}
            </a>
          );
        })}
      </div>
      <span aria-hidden="true" className="mx-3 h-px bg-outline-variant/60" />
      <Link
        href="/dashboard/settings/billing"
        className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <CartIcon className="h-5 w-5 shrink-0" />
        <span className="flex-1">{t("billing")}</span>
        <ChevronRightIcon className="h-4 w-4 shrink-0" />
      </Link>
    </nav>
  );
}

function MobileNav({
  filled,
  active,
  onSelect,
}: {
  filled: FilledState;
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}) {
  const t = useTranslations("Settings.nav");
  const done = COUNTED.filter((k) => filled[k]).length;
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const chip = stripRef.current?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    chip?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  return (
    <div className="sticky top-14 z-10 -mx-4 flex flex-col gap-2 border-b border-outline-variant/50 bg-surface/95 px-4 py-3 backdrop-blur sm:top-16 lg:hidden">
      <div className="flex items-center gap-3">
        <p className="shrink-0 text-[13px] font-semibold text-on-surface">
          {t("progress", { filled: done, total: COUNTED.length })}
        </p>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-high">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: `${(done / COUNTED.length) * 100}%` }}
          />
        </div>
      </div>
      <div
        ref={stripRef}
        className="relative -mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SECTIONS.map((key) => {
          const counted = COUNTED.includes(key);
          return (
            <a
              key={key}
              data-chip={key}
              href={`#${key}`}
              onClick={() => onSelect(key)}
              aria-current={active === key ? "true" : undefined}
              className={clsx(
                "relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-200",
                active === key ? "bg-primary-fixed text-primary" : "bg-surface-container text-on-surface",
              )}
            >
              {counted && filled[key] ? (
                <CheckIcon className={clsx("h-3.5 w-3.5", active === key ? "text-primary" : "text-success-500")} />
              ) : null}
              {t(key)}
              {counted ? <span className="sr-only">{filled[key] ? t("filled") : t("missing")}</span> : null}
            </a>
          );
        })}
        <Link
          href="/dashboard/settings/billing"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-container px-3.5 text-[13px] font-semibold text-on-surface"
        >
          {t("billing")}
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

export function SettingsShell({
  initialFilled,
  minSections,
  children,
}: {
  initialFilled: FilledState;
  minSections: number;
  children: React.ReactNode;
}) {
  const t = useTranslations("Settings");
  const router = useRouter();
  const [filled, setFilled] = useState<FilledState>(initialFilled);
  const [active, selectSection] = useScrollSpy(SECTIONS);
  const done = COUNTED.filter((k) => filled[k]).length;

  function report(key: SectionKey, value: boolean) {
    if (filled[key] === value) return;
    setFilled((prev) => ({ ...prev, [key]: value }));
    router.refresh();
  }

  return (
    <FilledContext.Provider value={report}>
      {done < minSections ? (
        <StatusBanner
          tone="warn"
          title={t("lowCompletenessAlert.title")}
          body={t("lowCompletenessAlert.body", { filled: done, total: COUNTED.length, min: minSections })}
        />
      ) : null}
      <MobileNav filled={filled} active={active} onSelect={selectSection} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <SectionNav filled={filled} active={active} onSelect={selectSection} />
          </div>
        </aside>
        <div className="flex min-w-0 max-w-4xl flex-col gap-6">{children}</div>
      </div>
    </FilledContext.Provider>
  );
}
