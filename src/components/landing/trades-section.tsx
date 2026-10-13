import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { localizedPath } from "@/i18n/routing";
import { VERTICALS, verticalPath } from "@/lib/verticals/catalog";
import { GUIDES, guidePath } from "@/lib/guides/catalog";
import { M } from "./landing-icons";

// "For your business" on the landing: the canonical brand definition in
// plain text, then a card per trade page and the guide. Links from the body
// of the strongest page are what tell search engines (and the AI assistants
// that read them) that those pages matter — the footer alone counts for less.
export async function TradesSection({ locale }: { locale: Locale }) {
  const [t, tv, tg, brand] = await Promise.all([
    getTranslations("LandingV2.trades"),
    getTranslations("Verticals"),
    getTranslations("Guides"),
    getTranslations("Brand"),
  ]);
  const guide = GUIDES[0];

  return (
    <section id="segmentos" className="mx-auto max-w-[1440px] px-4 py-12 md:px-10">
      <div className="max-w-[760px]">
        <h2 className="text-balance text-[28px] font-bold leading-[1.2] tracking-[-0.01em] sm:text-[36px]">
          {t("heading")}
        </h2>
        <p className="mt-4 text-[17px] leading-[28px] text-[#464555]">{brand("definition")}</p>
      </div>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {VERTICALS.map((v) => (
          <li key={v.slug}>
            <Link
              href={localizedPath(locale, verticalPath(v))}
              className="group flex h-full flex-col gap-1.5 rounded-2xl bg-white p-5 shadow-[0_1px_8px_rgba(0,0,0,0.05)] transition-shadow hover:shadow-[0_8px_24px_rgba(53,37,205,0.12)]"
            >
              <span className="flex items-center justify-between gap-3 text-[17px] font-semibold text-[#1b1b24] group-hover:text-[#3525cd]">
                {tv(`${v.key}.navLabel`)}
                <M name="arrow_forward" size={18} className="shrink-0 text-[#3525cd]" />
              </span>
              <span className="text-[14px] leading-[22px] text-[#464555]">{tv(`${v.key}.cardLine`)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={localizedPath(locale, guidePath(guide))}
        className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-[#d9d4ff] bg-[#f5f2ff] p-5 transition-colors hover:border-[#3525cd]"
      >
        <span>
          <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#3525cd]">
            {tv("common.guideLabel")}
          </span>
          <span className="mt-1 block text-[16px] font-semibold leading-[24px]">{tg(`${guide.key}.title`)}</span>
        </span>
        <M name="arrow_forward" size={20} className="shrink-0 text-[#3525cd]" />
      </Link>
    </section>
  );
}
