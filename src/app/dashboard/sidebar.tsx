"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { logout } from "@/lib/auth/actions";
import {
  SearchIcon,
  UsersIcon,
  PackageIcon,
  CalendarIcon,
  BarChartIcon,
  SettingsIcon,
  LogoutIcon,
} from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/language-switcher";

// `requiresAgent` gates a tab on having hired the agent it exists to serve:
// a barbershop running only Ana has no use for a Products tab, and a shop
// running only Malu has nothing to schedule. Items without it are always
// shown. The data stays company-scoped either way (products.company_id /
// services.company_id) — this is purely about what's worth showing.
const NAV_ITEMS = [
  { href: "/dashboard", key: "marketplace" as const, icon: SearchIcon, match: (p: string) => p === "/dashboard" || p.startsWith("/dashboard/agents") },
  { href: "/dashboard/my-agents", key: "myAgents" as const, icon: UsersIcon, match: (p: string) => p.startsWith("/dashboard/my-agents") },
  { href: "/dashboard/products", key: "products" as const, icon: PackageIcon, requiresAgent: "malu", match: (p: string) => p.startsWith("/dashboard/products") },
  { href: "/dashboard/scheduling", key: "scheduling" as const, icon: CalendarIcon, requiresAgent: "ana", match: (p: string) => p.startsWith("/dashboard/scheduling") },
  { href: "/dashboard/metrics", key: "metrics" as const, icon: BarChartIcon, match: (p: string) => p.startsWith("/dashboard/metrics") },
  { href: "/dashboard/settings", key: "settings" as const, icon: SettingsIcon, match: (p: string) => p.startsWith("/dashboard/settings") },
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

// Staffra "Human-Centric AI" admin shell (Stitch): a light persistent rail on
// desktop, a slim top bar + thumb-reachable bottom tab bar on mobile. All
// three read the same NAV_ITEMS so active state never drifts.
export function Sidebar({
  companyName,
  email,
  locale,
  hiredAgentSlugs,
}: {
  companyName: string | null;
  email: string | null;
  locale: "en" | "pt";
  hiredAgentSlugs: string[];
}) {
  const pathname = usePathname();
  const t = useTranslations("Dashboard.tabs");
  const tDash = useTranslations("Dashboard");

  const identityLabel = companyName ?? email ?? "";

  // Kept as one derived list so the desktop rail and the mobile tab bar can't
  // disagree about which tabs exist — the same reason they already share
  // NAV_ITEMS. A merchant who is *on* a hidden tab's URL still sees the page
  // itself; this only controls the navigation.
  const navItems = NAV_ITEMS.filter(
    (item) => !item.requiresAgent || hiredAgentSlugs.includes(item.requiresAgent),
  );

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
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

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
          <LanguageSwitcher currentLocale={locale} />
          <form action={logout}>
            <button type="submit" aria-label={tDash("logout")} className="p-1.5 text-on-surface-variant">
              <LogoutIcon className="h-5 w-5" />
            </button>
          </form>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-outline-variant bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden">
        {navItems.map((item) => {
          const isActive = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-1 py-2.5"
            >
              <Icon
                className={clsx(
                  "h-5 w-5 transition-colors duration-150",
                  isActive ? "text-primary" : "text-on-surface-variant",
                )}
              />
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
      </nav>
    </>
  );
}
