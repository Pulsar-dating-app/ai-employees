"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { logout } from "@/lib/auth/actions";
import {
  UsersIcon,
  PackageIcon,
  CalendarIcon,
  BarChartIcon,
  SettingsIcon,
  LogoutIcon,
  LockIcon,
  ChatIcon,
  MoreIcon,
} from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { UsageSummary } from "@/lib/billing/usage-summary";
import { BillingPastDueAlert } from "./billing-alert";

// Every tab is always shown. Products → Malu, Scheduling → Ana, Performance
// → any hire: while that team member isn't hired the tab is **muted + gets a
// lock icon** (via `isLocked`), and clicking it lands on the page's own
// `LockedPage` ("hire X to unlock"). The page check is the real gate — this
// is presentation only. Settings / My Team / Conversations are never gated
// (company-wide, useful with zero agents).
//
// One "My Team" destination, not two (2026-09-10): this used to be a
// separate "Marketplace" (browse/hire) tab plus "My Team" (manage hires) --
// merged into one unified list once per-agent pricing went away (Trello P6)
// and there was no reason left to browse agents separately from managing
// them. `/dashboard` now shows every catalog agent regardless of hire
// status; its own `match` covers `/dashboard/agents/*` (the per-agent
// hire-flow detail page) and `/dashboard/my-agents/*` (the per-agent
// Connections/settings page, unchanged) too, so the nav item stays
// highlighted across the whole flow. See the 2026-09-10 decisions.md entry.
//
// `mobilePrimary` is mobile-only (the desktop rail always shows all 6): the
// bottom tab bar picks its busiest/most-orienting destinations for direct
// one-tap access, and folds the rest into a "More" sheet rather than
// cramming everything into one row — see the 2026-09-10 decisions.md entry
// for why (a crowded bottom bar is unreadable at phone width; iOS/Material
// both cap direct tabs around 4-5).
const NAV_ITEMS = [
  { href: "/dashboard", key: "myAgents" as const, icon: UsersIcon, match: (p: string) => p === "/dashboard" || p.startsWith("/dashboard/agents") || p.startsWith("/dashboard/my-agents"), mobilePrimary: true },
  { href: "/dashboard/conversations", key: "conversations" as const, icon: ChatIcon, match: (p: string) => p.startsWith("/dashboard/conversations"), mobilePrimary: true },
  { href: "/dashboard/products", key: "products" as const, icon: PackageIcon, match: (p: string) => p.startsWith("/dashboard/products"), isLocked: (s: string[]) => !s.includes("malu") },
  { href: "/dashboard/scheduling", key: "scheduling" as const, icon: CalendarIcon, match: (p: string) => p.startsWith("/dashboard/scheduling"), isLocked: (s: string[]) => !s.includes("ana") },
  { href: "/dashboard/metrics", key: "metrics" as const, icon: BarChartIcon, match: (p: string) => p.startsWith("/dashboard/metrics"), isLocked: (s: string[]) => s.length === 0 },
  { href: "/dashboard/settings", key: "settings" as const, icon: SettingsIcon, match: (p: string) => p.startsWith("/dashboard/settings"), mobilePrimary: true },
];

// Sidebar top (Stitch "Performance Analytics" screen): the brand, then an
// identity block — avatar-initial, the account label, the workspace tier —
// directly under it. Identity used to sit in the footer; the footer is now
// just the log-out action.
function SidebarHeader({
  identityLabel,
  workspaceLabel,
}: {
  identityLabel: string;
  workspaceLabel: string;
}) {
  const initial = identityLabel ? identityLabel.charAt(0).toUpperCase() : "?";
  return (
    <div className="flex flex-col gap-4 border-b border-outline-variant px-6 py-5">
      <div className="flex items-center gap-2.5">
        <Image src="/logo-icon.png" alt="" width={36} height={36} className="shrink-0 rounded-md" />
        <span className="text-lg font-bold tracking-tight text-primary">Staffra</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-sm font-semibold text-primary">
          {initial}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-on-surface">
            {identityLabel || workspaceLabel}
          </span>
          <span className="truncate text-xs text-on-surface-variant">{workspaceLabel}</span>
        </div>
      </div>
    </div>
  );
}

// A compact reply-usage readout for the desktop rail -- the same {used,
// limit} count the billing settings page's own meter shows (P5), just
// small and always-visible instead of buried a tab away. Neutral while
// comfortably under the limit, amber ≥80%, red once it's actually at/over
// (the P7 hard-stop band is what silences bots, not this number -- this is
// just the same threshold the settings page's own near/over banners use).
// Links straight to the page that can fix it.
function UsageTracker({ usage }: { usage: UsageSummary | null }) {
  const t = useTranslations("Billing.usage");
  if (!usage || usage.limit <= 0) return null;

  const pct = (usage.used / usage.limit) * 100;
  const overLimit = usage.used >= usage.limit;
  const nearLimit = !overLimit && pct >= 80;

  return (
    <Link
      href="/dashboard/settings/billing"
      className={clsx(
        "mx-3 mb-3 flex items-center rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
        overLimit
          ? "border-error/30 bg-error-container/40 text-error hover:brightness-95"
          : nearLimit
            ? "border-orange-200 bg-orange-50 text-orange-700 hover:brightness-95"
            : "border-outline-variant/60 bg-surface-container-low text-on-surface-variant hover:bg-surface-container",
      )}
    >
      <span className="truncate">{t("count", { used: usage.used, limit: usage.limit })}</span>
    </Link>
  );
}

type OverflowItem = (typeof NAV_ITEMS)[number] & { locked: boolean };

// The bottom bar's overflow -- a sheet rising from the bar itself (not a
// centered `Dialog`, which would read as unrelated to the tab that opened
// it). Portaled to document.body like `dialog.tsx`, same Escape/backdrop
// dismissal; a route change (tapping a row, or the browser back button)
// closes it via the effect in `Sidebar` rather than anything in here, so
// there's no stale-open sheet sitting over the new page.
function MobileMoreSheet({
  items,
  pathname,
  onClose,
}: {
  items: OverflowItem[];
  pathname: string;
  onClose: () => void;
}) {
  const t = useTranslations("Dashboard.tabs");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-30 sm:hidden">
      <div
        className="nav-sheet-backdrop-in absolute inset-0 bg-on-surface/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("more")}
        className="nav-sheet-panel-in absolute inset-x-0 bottom-0 rounded-t-2xl bg-surface-container-lowest pb-[env(safe-area-inset-bottom)] shadow-level2"
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-outline-variant" aria-hidden="true" />
        <nav className="flex flex-col gap-1 p-3">
          {items.map((item) => {
            const isActive = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                onClick={onClose}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors duration-150",
                  isActive
                    ? "bg-secondary-container font-bold text-on-secondary-container"
                    : "font-medium text-on-surface-variant hover:bg-surface-container",
                  item.locked && !isActive && "opacity-55",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{t(item.key)}</span>
                {item.locked ? (
                  <>
                    <LockIcon className="ml-auto h-3.5 w-3.5 shrink-0" />
                    <span className="sr-only">{t("locked")}</span>
                  </>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>,
    document.body,
  );
}

// Staffra "Human-Centric AI" admin shell (Stitch): a light persistent rail on
// desktop, a slim top bar + thumb-reachable bottom tab bar on mobile. All
// three read the same NAV_ITEMS so active state never drifts.
export function Sidebar({
  companyName,
  email,
  locale,
  hiredAgentSlugs,
  isBillingPastDue,
  usage,
}: {
  companyName: string | null;
  email: string | null;
  locale: "en" | "pt";
  hiredAgentSlugs: string[];
  isBillingPastDue: boolean;
  usage: UsageSummary | null;
}) {
  const pathname = usePathname();
  const t = useTranslations("Dashboard.tabs");
  const tDash = useTranslations("Dashboard");

  const identityLabel = companyName ?? email ?? "";

  const navItems = NAV_ITEMS.map((item) => ({
    ...item,
    locked: item.isLocked?.(hiredAgentSlugs) ?? false,
  }));
  const mobilePrimaryItems = navItems.filter((item) => item.mobilePrimary);
  const mobileOverflowItems = navItems.filter((item) => !item.mobilePrimary);
  const overflowActive = mobileOverflowItems.some((item) => item.match(pathname));

  const [moreOpen, setMoreOpen] = useState(false);
  // A route change -- a row tapped inside the sheet, or the browser's own
  // back/forward -- always closes it. Adjusted during render (React's own
  // recommended pattern for "reset state when a prop changes"), not an
  // effect: an effect-based reset paints one extra frame with the sheet
  // still open before closing it, and lint (react-hooks/set-state-in-effect)
  // flags the cascading re-render this causes.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMoreOpen(false);
  }

  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-outline-variant bg-surface sm:flex">
        <SidebarHeader identityLabel={identityLabel} workspaceLabel={tDash("workspaceLabel")} />

        <nav className="flex flex-1 flex-col gap-1 px-3 pt-4">
          {navItems.map((item) => {
            const isActive = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150",
                  isActive
                    ? "bg-secondary-container font-bold text-on-secondary-container"
                    : "font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface",
                  item.locked && !isActive && "opacity-55 hover:opacity-100",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{t(item.key)}</span>
                {item.locked ? (
                  <>
                    <LockIcon className="ml-auto h-3.5 w-3.5 shrink-0" />
                    <span className="sr-only">{t("locked")}</span>
                  </>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <UsageTracker usage={usage} />

        <div className="border-t border-outline-variant p-3">
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-on-surface-variant transition-colors duration-150 hover:bg-surface-container hover:text-on-surface"
            >
              <LogoutIcon className="h-5 w-5 shrink-0" />
              {tDash("logout")}
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-outline-variant bg-surface px-4 sm:hidden">
        <div className="flex items-center gap-2">
          <Image src="/logo-icon.png" alt="" width={32} height={32} className="shrink-0 rounded-md" />
          <span className="text-base font-bold tracking-tight text-primary">Staffra</span>
        </div>
        <div className="flex items-center gap-2">
          {isBillingPastDue ? <BillingPastDueAlert compact /> : null}
          <LanguageSwitcher currentLocale={locale} />
          <form action={logout}>
            <button type="submit" aria-label={tDash("logout")} className="p-1.5 text-on-surface-variant">
              <LogoutIcon className="h-5 w-5" />
            </button>
          </form>
        </div>
      </header>

      {/* Mobile bottom tab bar -- 4 direct tabs + "More" for the rest, not
          all 7 crammed into one row (see NAV_ITEMS's own comment). */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-outline-variant bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
        {mobilePrimaryItems.map((item) => {
          const isActive = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={clsx(
                "flex flex-1 flex-col items-center gap-1 py-2.5",
                item.locked && !isActive && "opacity-55",
              )}
            >
              <span className="relative">
                <Icon
                  className={clsx(
                    "h-5 w-5 transition-colors duration-150",
                    isActive ? "text-primary" : "text-on-surface-variant",
                  )}
                />
                {item.locked ? (
                  <LockIcon className="absolute -right-1.5 -top-1 h-3 w-3 text-on-surface-variant" />
                ) : null}
              </span>
              <span
                className={clsx(
                  "text-[11px] font-medium transition-colors duration-150",
                  isActive ? "text-primary" : "text-on-surface-variant",
                )}
              >
                {t(item.key)}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className="flex flex-1 flex-col items-center gap-1 py-2.5"
        >
          <MoreIcon
            className={clsx(
              "h-5 w-5 transition-colors duration-150",
              overflowActive ? "text-primary" : "text-on-surface-variant",
            )}
          />
          <span
            className={clsx(
              "text-[11px] font-medium transition-colors duration-150",
              overflowActive ? "text-primary" : "text-on-surface-variant",
            )}
          >
            {t("more")}
          </span>
        </button>
      </nav>

      {moreOpen ? (
        <MobileMoreSheet items={mobileOverflowItems} pathname={pathname} onClose={() => setMoreOpen(false)} />
      ) : null}
    </>
  );
}
