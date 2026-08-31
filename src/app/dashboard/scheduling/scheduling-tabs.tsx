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
  { href: "/dashboard/scheduling/settings", key: "settings" as const, exact: false },
];

export function SchedulingTabs() {
  const pathname = usePathname();
  const t = useTranslations("Scheduling.tabs");

  return (
    <nav className="flex gap-1 border-b border-outline-variant" aria-label={t("ariaLabel")}>
      {TABS.map((tab) => {
        const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={clsx(
              "-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors duration-150",
              isActive
                ? "border-primary font-semibold text-primary"
                : "border-transparent font-medium text-on-surface-variant hover:border-outline-variant hover:text-on-surface",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
