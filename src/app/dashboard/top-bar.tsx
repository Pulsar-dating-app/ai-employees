"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";
import { BillingPastDueAlert, type SilenceReason } from "./billing-alert";

const SECTIONS = [
  {
    key: "myAgents" as const,
    match: (p: string) =>
      p === "/dashboard" || p.startsWith("/dashboard/agents") || p.startsWith("/dashboard/my-agents"),
  },
  { key: "products" as const, match: (p: string) => p.startsWith("/dashboard/products") },
  { key: "scheduling" as const, match: (p: string) => p.startsWith("/dashboard/scheduling") },
  { key: "conversations" as const, match: (p: string) => p.startsWith("/dashboard/conversations") },
  { key: "metrics" as const, match: (p: string) => p.startsWith("/dashboard/metrics") },
  { key: "settings" as const, match: (p: string) => p.startsWith("/dashboard/settings") },
];

// Sticky top app bar (Stitch admin shell) — desktop only; the mobile top
// bar lives in <Sidebar>. Shows the current section, the past-due billing
// alert (if any), and the language toggle.
export function TopBar({
  locale,
  silence,
}: {
  locale: "en" | "pt";
  silence: SilenceReason | null;
}) {
  const pathname = usePathname();
  const t = useTranslations("Dashboard.tabs");
  const section = SECTIONS.find((s) => s.match(pathname))?.key ?? "myAgents";

  return (
    <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-outline-variant bg-surface/80 px-10 backdrop-blur-md sm:flex">
      <span className="text-lg font-extrabold tracking-tight text-primary">{t(section)}</span>
      <div className="flex items-center gap-3">
        {silence ? <BillingPastDueAlert reason={silence} /> : null}
        <LanguageSwitcher currentLocale={locale} />
      </div>
    </header>
  );
}
