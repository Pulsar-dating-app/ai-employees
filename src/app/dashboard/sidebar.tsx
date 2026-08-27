"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { logout } from "@/lib/auth/actions";
import {
  SearchIcon,
  UsersIcon,
  PackageIcon,
  SettingsIcon,
  LogoutIcon,
} from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/language-switcher";

const NAV_ITEMS = [
  { href: "/dashboard", key: "marketplace" as const, icon: SearchIcon, match: (p: string) => p === "/dashboard" || p.startsWith("/dashboard/agents") },
  { href: "/dashboard/my-agents", key: "myAgents" as const, icon: UsersIcon, match: (p: string) => p.startsWith("/dashboard/my-agents") },
  { href: "/dashboard/products", key: "products" as const, icon: PackageIcon, match: (p: string) => p.startsWith("/dashboard/products") },
  { href: "/dashboard/settings", key: "settings" as const, icon: SettingsIcon, match: (p: string) => p.startsWith("/dashboard/settings") },
];

function BrandMark({ workspaceLabel }: { workspaceLabel: string }) {
  return (
    <div className="flex flex-col gap-1 px-6 py-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-on-primary">
          S
        </span>
        <span className="text-lg font-bold tracking-tight text-primary">Sidde</span>
      </div>
      <span className="pl-[38px] text-xs font-semibold text-on-surface-variant">{workspaceLabel}</span>
    </div>
  );
}

// Sidde "Human-Centric AI" admin shell (Stitch): a light persistent rail on
// desktop, a slim top bar + thumb-reachable bottom tab bar on mobile. All
// three read the same NAV_ITEMS so active state never drifts.
export function Sidebar({
  companyName,
  email,
  locale,
}: {
  companyName: string | null;
  email: string | null;
  locale: "en" | "pt";
}) {
  const pathname = usePathname();
  const t = useTranslations("Dashboard.tabs");
  const tDash = useTranslations("Dashboard");

  const identityLabel = companyName ?? email ?? "";
  const identityInitial = identityLabel ? identityLabel.charAt(0).toUpperCase() : "?";

  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-outline-variant bg-surface sm:flex">
        <BrandMark workspaceLabel={tDash("workspaceLabel")} />

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => {
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

        <div className="flex flex-col gap-3 border-t border-outline-variant p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-sm font-semibold text-primary">
              {identityInitial}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-on-surface">{identityLabel}</span>
              {companyName && email ? (
                <span className="truncate text-xs text-on-surface-variant">{email}</span>
              ) : null}
            </div>
            <form action={logout}>
              <button
                type="submit"
                aria-label={tDash("logout")}
                className="shrink-0 rounded-md p-1.5 text-on-surface-variant transition-colors duration-150 hover:bg-surface-container hover:text-on-surface"
              >
                <LogoutIcon className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-outline-variant bg-surface px-4 sm:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-on-primary">
            S
          </span>
          <span className="text-base font-bold tracking-tight text-primary">Sidde</span>
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
        {NAV_ITEMS.map((item) => {
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
