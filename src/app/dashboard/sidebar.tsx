"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { logout } from "@/lib/auth/actions";
import { GridIcon, UsersIcon, PackageIcon, SettingsIcon, LogoutIcon } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/language-switcher";

const NAV_ITEMS = [
  { href: "/dashboard", key: "marketplace" as const, icon: GridIcon, match: (p: string) => p === "/dashboard" || p.startsWith("/dashboard/agents") },
  { href: "/dashboard/my-agents", key: "myAgents" as const, icon: UsersIcon, match: (p: string) => p.startsWith("/dashboard/my-agents") },
  { href: "/dashboard/products", key: "products" as const, icon: PackageIcon, match: (p: string) => p.startsWith("/dashboard/products") },
  { href: "/dashboard/settings", key: "settings" as const, icon: SettingsIcon, match: (p: string) => p.startsWith("/dashboard/settings") },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5 px-6 py-6">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-intent-500 text-sm font-bold text-white">
        S
      </span>
      <span className="text-lg font-semibold tracking-tight text-white">Sidde</span>
    </div>
  );
}

// Modern admin shell: a persistent dark rail on desktop, a slim top bar +
// thumb-reachable bottom tab bar on mobile. Both read the same NAV_ITEMS so
// active state and labels never drift between breakpoints.
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
  const tLogout = useTranslations("Dashboard");

  const identityLabel = companyName ?? email ?? "";
  const identityInitial = identityLabel ? identityLabel.charAt(0).toUpperCase() : "?";

  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-neutral-900 sm:flex">
        <BrandMark />

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
                  "relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                  isActive
                    ? "bg-accent-500/15 text-white"
                    : "text-neutral-400 hover:bg-white/5 hover:text-neutral-100",
                )}
              >
                <span
                  className={clsx(
                    "absolute inset-y-1 left-0 w-1 rounded-full bg-accent-400 transition-all duration-300 ease-out",
                    isActive ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0",
                  )}
                />
                <Icon className={clsx("h-5 w-5 shrink-0", isActive ? "text-accent-400" : "text-neutral-500")} />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        {/* Identity footer — who/what you're signed in as, then logout.
            A bare "Log out" row with no identity reads as unfinished on an
            admin shell; this is the one place the whole rail confirms it. */}
        <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-4">
          <LanguageSwitcher currentLocale={locale} variant="dark" />
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-500/20 text-sm font-semibold text-accent-400">
              {identityInitial}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-neutral-100">{identityLabel}</span>
              {companyName && email ? (
                <span className="truncate text-xs text-neutral-500">{email}</span>
              ) : null}
            </div>
            <form action={logout}>
              <button
                type="submit"
                aria-label={tLogout("logout")}
                className="shrink-0 rounded-md p-1.5 text-neutral-500 transition-colors duration-200 hover:bg-white/5 hover:text-neutral-100"
              >
                <LogoutIcon className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between bg-neutral-900 px-4 sm:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-intent-500 text-xs font-bold text-white">
            S
          </span>
          <span className="text-base font-semibold tracking-tight text-white">Sidde</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher currentLocale={locale} variant="dark" />
          <form action={logout}>
            <button type="submit" aria-label={tLogout("logout")} className="p-1.5 text-neutral-400">
              <LogoutIcon className="h-5 w-5" />
            </button>
          </form>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex bg-neutral-900 pb-[env(safe-area-inset-bottom)] sm:hidden"
        style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
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
              <Icon className={clsx("h-5 w-5 transition-colors duration-200", isActive ? "text-accent-400" : "text-neutral-500")} />
              <span
                className={clsx(
                  "text-[11px] font-medium transition-colors duration-200",
                  isActive ? "text-white" : "text-neutral-500",
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
