"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/lib/i18n/actions";
import type { Locale } from "@/i18n/request";

// Each language name is shown in itself (not translated) — the reader
// needs to recognize their own language regardless of what's currently set.
const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English",
  pt: "Português",
};

export function LanguageSwitcher({ currentLocale }: { currentLocale: Locale }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    await setLocale(next);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <select
      value={currentLocale}
      onChange={handleChange}
      disabled={isPending}
      aria-label="Language"
      className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-700 outline-none focus:border-accent-500 disabled:opacity-60"
    >
      {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </select>
  );
}
