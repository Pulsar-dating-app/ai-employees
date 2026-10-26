"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";

// Trello K5 — Scheduling is an area, not a page: K1 (services), K4
// (appointments) and K3 (settings — business hours + approval) all live
// under it, with K2 (calendar connect) next to fold in. The sidebar gets
// one top-level tab; these sub-tabs switch between the area's screens, the
// way the settings shell splits its own sections.
//
// Exact-match on the index route so /scheduling/services doesn't light both.
const TABS = [
  { href: "/dashboard/scheduling", key: "appointments" as const, exact: true },
  { href: "/dashboard/scheduling/services", key: "services" as const, exact: false },
  // 2026-09-24 -- one schedule per professional (barbers, doctors...).
  { href: "/dashboard/scheduling/professionals", key: "professionals" as const, exact: false },
  { href: "/dashboard/scheduling/settings", key: "settings" as const, exact: false },
];

export function SchedulingTabs({
  servicesNeedAttention = false,
  settingsNeedAttention = false,
}: {
  /** No services created yet (excluding the seeded default). */
  servicesNeedAttention?: boolean;
  /** Google Calendar not connected, or business hours never set. */
  settingsNeedAttention?: boolean;
}) {
  const pathname = usePathname();
  const t = useTranslations("Scheduling.tabs");
  const tDash = useTranslations("Dashboard.tabs");

  const attentionByKey: Partial<Record<(typeof TABS)[number]["key"], boolean>> = {
    services: servicesNeedAttention,
    settings: settingsNeedAttention,
  };

  // Phones get a 2x2 grid of pills: the four labels side by side are wider
  // than a phone, and as one row they widened the whole page (468px on a
  // 375px screen), which cut off Settings and shifted every drawer opened
  // from these pages (2026-10-26). From `sm` up, the underline row as before.
  return (
    <nav
      className="grid grid-cols-2 gap-2 sm:flex sm:gap-1 sm:border-b sm:border-outline-variant"
      aria-label={t("ariaLabel")}
    >
      {TABS.map((tab) => {
        const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={clsx(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm transition-colors duration-150",
              "sm:-mb-px sm:min-h-0 sm:justify-start sm:rounded-none sm:border-b-2 sm:px-4 sm:py-2.5",
              isActive
                ? "bg-primary-fixed font-semibold text-primary sm:border-primary sm:bg-transparent"
                : "bg-surface-container font-medium text-on-surface-variant hover:text-on-surface sm:border-transparent sm:bg-transparent sm:hover:border-outline-variant",
            )}
          >
            {t(tab.key)}
            {attentionByKey[tab.key] ? (
              <>
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                <span className="sr-only">{tDash("needsSetup")}</span>
              </>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
