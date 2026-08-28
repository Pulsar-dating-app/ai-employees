"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";

const SECTIONS = [
  { key: "marketplace" as const, match: (p: string) => p === "/dashboard" || p.startsWith("/dashboard/agents") },
  { key: "myAgents" as const, match: (p: string) => p.startsWith("/dashboard/my-agents") },
  { key: "products" as const, match: (p: string) => p.startsWith("/dashboard/products") },
  { key: "metrics" as const, match: (p: string) => p.startsWith("/dashboard/metrics") },
  { key: "settings" as const, match: (p: string) => p.startsWith("/dashboard/settings") },
];

// Sticky top app bar (Stitch admin shell) — desktop only; the mobile top
// bar lives in <Sidebar>. Shows the current section and the language
// toggle. No notification/help affordances — nothing backs them yet.
export function TopBar({ locale }: { locale: "en" | "pt" }) {
  const pathname = usePathname();
  const t = useTranslations("Dashboard.tabs");
  const section = SECTIONS.find((s) => s.match(pathname))?.key ?? "marketplace";

  return (
    <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-outline-variant bg-surface/80 px-10 backdrop-blur-md sm:flex">
      <span className="text-lg font-extrabold tracking-tight text-primary">{t(section)}</span>
      <LanguageSwitcher currentLocale={locale} />
    </header>
  );
}
