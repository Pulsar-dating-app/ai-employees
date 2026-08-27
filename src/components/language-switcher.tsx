"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import clsx from "clsx";
import { setLocale } from "@/lib/i18n/actions";
import type { Locale } from "@/i18n/request";

// Short codes, not full names — a two-button segmented toggle reads faster
// than a dropdown for exactly two options, and avoids the browser's own
// unstyled <select> chrome (the previous version), which never matched
// this app's design system on any surface it sat on.
const LOCALES: Locale[] = ["en", "pt"];

const VARIANT_CLASSES = {
  light: {
    track: "bg-surface-container",
    active: "bg-surface-container-lowest text-on-surface shadow-sm",
    inactive: "text-on-surface-variant hover:text-on-surface",
  },
  dark: {
    track: "bg-white/10",
    active: "bg-white/90 text-on-surface shadow-sm",
    inactive: "text-white/55 hover:text-white/85",
  },
} as const;

export function LanguageSwitcher({
  currentLocale,
  variant = "light",
}: {
  currentLocale: Locale;
  variant?: "light" | "dark";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const c = VARIANT_CLASSES[variant];

  function handleSelect(next: Locale) {
    if (next === currentLocale || isPending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Language"
      className={clsx(
        "inline-flex items-center gap-0.5 rounded-full p-0.5 text-[12px] font-semibold transition-opacity",
        c.track,
        isPending && "opacity-60",
      )}
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          role="radio"
          aria-checked={locale === currentLocale}
          disabled={isPending}
          onClick={() => handleSelect(locale)}
          className={clsx(
            "rounded-full px-2.5 py-1 uppercase tracking-wide transition-colors duration-150",
            locale === currentLocale ? c.active : c.inactive,
          )}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
