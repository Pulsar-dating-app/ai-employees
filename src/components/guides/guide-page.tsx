import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { intlTag, type Locale } from "@/i18n/locales";
import { HREFLANG, localizeHref, localizedPath } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/seo/site";
import { buildArticleGraph } from "@/lib/seo/structured-data";
import { guidePath, type Guide } from "@/lib/guides/catalog";
import { VERTICALS, verticalPath } from "@/lib/verticals/catalog";
import { landingV2Sans } from "@/components/landing/fonts";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { CascadeText } from "@/components/landing/cascade-text";
import { M } from "@/components/landing/landing-icons";
import { LANDING_PLANS } from "@/components/landing/landing-plans";
import { JsonLdScript, loadSchemaContext } from "@/components/seo/schema-context";

// A long-form guide (/guias/<slug>, see src/lib/guides/catalog.ts). Built to
// be the page an AI assistant or a search result quotes when someone asks a
// broad question: a short answer first, plain sections, an honest comparison
// of the options by category (never named competitors), a comparison table,
// a checklist, the cost, where Staffra fits, links to every trade page and a
// FAQ. Copy is `Guides.<key>` in messages/*.json.

type Section = { heading: string; paragraphs: string[] };
type Option = { name: string; how: string; pros: string[]; cons: string[]; bestFor: string };
type Row = { criterion: string; values: string[] };
type Item = { title: string; body: string };
type Faq = { q: string; a: string };

const BRL_WHOLE = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const ENTRY_PRICE_MONTH = BRL_WHOLE.format(LANDING_PLANS[0].ownCents / 100);

export async function GuidePage({ guide }: { guide: Guide }) {
  const locale = (await getLocale()) as Locale;
  const [tAll, tv, { site }] = await Promise.all([
    getTranslations("Guides"),
    getTranslations("Verticals"),
    loadSchemaContext(),
  ]);
  const k = guide.key;
  const t = (key: string, values?: Record<string, string>) => tAll(`${k}.${key}`, values);

  const sections = tAll.raw(`${k}.sections`) as Section[];
  const options = tAll.raw(`${k}.options`) as Option[];
  const rows = (tAll.raw(`${k}.table`) as Row[]).map((row) => ({
    criterion: row.criterion,
    values: row.values.map((v) => v.replace("{price}", ENTRY_PRICE_MONTH)),
  }));
  const checklist = tAll.raw(`${k}.checklist`) as Item[];
  const faq = tAll.raw(`${k}.faq`) as Faq[];

  const home = localizedPath(locale, "/");
  const pageUrl = absoluteUrl(localizedPath(locale, guidePath(guide)));
  const hire = localizeHref(locale, "/?auth=signup");
  const updated = new Intl.DateTimeFormat(intlTag(locale), { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${guide.updated}T12:00:00Z`),
  );

  const graph = buildArticleGraph({
    site,
    url: pageUrl,
    headline: t("title"),
    description: t("seoDescription"),
    inLanguage: HREFLANG[locale],
    datePublished: guide.published,
    dateModified: guide.updated,
    breadcrumbs: [
      { name: tv("common.breadcrumbHome"), url: absoluteUrl(home) },
      { name: t("breadcrumb"), url: pageUrl },
    ],
  });

  const h2 = "text-balance text-[26px] font-bold leading-[1.2] tracking-[-0.01em] sm:text-[30px]";
  const body = "text-[17px] leading-[29px] text-[#3b3a4d]";

  return (
    <div
      className={`${landingV2Sans.className} landing-v2-root min-h-screen bg-[#fcf8ff] text-[#1b1b24] antialiased [&_section]:scroll-mt-24`}
    >
      <JsonLdScript graph={graph} />
      <SiteHeader locale={locale} onLanding={false} />

      <main className="w-full pt-16 sm:pt-20">
        <article className="mx-auto flex max-w-[820px] flex-col gap-14 px-4 pb-20 pt-8 md:px-8 lg:pt-14">
          <header>
            <nav aria-label="Breadcrumb" className="mb-6 text-[13px] font-medium text-[#464555]">
              <ol className="flex flex-wrap items-center gap-1.5">
                <li>
                  <Link href={home} className="hover:text-[#3525cd]">
                    {tv("common.breadcrumbHome")}
                  </Link>
                </li>
                <li aria-hidden="true">›</li>
                <li aria-current="page" className="text-[#1b1b24]">
                  {t("breadcrumb")}
                </li>
              </ol>
            </nav>
            <span className="rounded-full bg-[#e2dfff] px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#3525cd]">
              {t("eyebrow")}
            </span>
            <h1 className="mt-4 text-balance text-[32px] font-extrabold leading-[1.12] tracking-[-0.02em] sm:text-[44px]">
              {t("title")}
            </h1>
            <p className="mt-4 text-[14px] font-medium text-[#464555]">
              <time dateTime={guide.updated}>{t("updatedLabel", { date: updated })}</time>
            </p>
          </header>

          {/* Short answer first */}
          <section className="rounded-2xl border border-[#d9d4ff] bg-[#f5f2ff] p-6 md:p-8">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#3525cd]">{t("tldrHeading")}</h2>
            <p className="mt-3 text-[18px] leading-[30px]">{t("tldr")}</p>
          </section>

          {sections.map((section) => (
            <section key={section.heading} className="flex flex-col gap-4">
              <h2 className={h2}>{section.heading}</h2>
              {section.paragraphs.map((p) => (
                <p key={p} className={body}>
                  {p}
                </p>
              ))}
            </section>
          ))}

          {/* The options, by category */}
          <section className="flex flex-col gap-5">
            <h2 className={h2}>{t("optionsHeading")}</h2>
            <p className={body}>{t("optionsIntro")}</p>
            {options.map((option, i) => (
              <article key={option.name} className="rounded-2xl bg-white p-6 shadow-[0_1px_8px_rgba(0,0,0,0.05)]">
                <h3 className="text-[20px] font-semibold leading-[28px]">
                  <span className="mr-2 text-[#3525cd]">{i + 1}.</span>
                  {option.name}
                </h3>
                <p className="mt-2 text-[16px] leading-[27px] text-[#464555]">{option.how}</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#18794e]">{t("prosLabel")}</p>
                    <ul className="mt-2 flex flex-col gap-1.5 text-[15px] leading-[24px]">
                      {option.pros.map((pro) => (
                        <li key={pro} className="flex gap-2">
                          <span aria-hidden="true" className="text-[#18794e]">+</span>
                          {pro}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#b42318]">{t("consLabel")}</p>
                    <ul className="mt-2 flex flex-col gap-1.5 text-[15px] leading-[24px]">
                      {option.cons.map((con) => (
                        <li key={con} className="flex gap-2">
                          <span aria-hidden="true" className="text-[#b42318]">−</span>
                          {con}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="mt-4 text-[15px] leading-[24px]">
                  <strong className="font-semibold">{t("bestForLabel")}</strong> {option.bestFor}
                </p>
              </article>
            ))}
          </section>

          {/* Comparison table */}
          <section className="flex flex-col gap-4">
            <h2 className={h2}>{t("tableHeading")}</h2>
            <div className="overflow-x-auto rounded-2xl border border-[#e4e1ee] bg-white">
              <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
                <thead>
                  <tr className="bg-[#f3f0fb]">
                    <th scope="col" className="px-4 py-3 font-semibold text-[#464555]">
                      {t("tableCriterion")}
                    </th>
                    {options.map((option) => (
                      <th key={option.name} scope="col" className="px-4 py-3 font-semibold">
                        {option.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.criterion} className="border-t border-[#e4e1ee] align-top">
                      <th scope="row" className="px-4 py-3 font-semibold">
                        {row.criterion}
                      </th>
                      {row.values.map((value, i) => (
                        <td key={i} className="px-4 py-3 text-[#464555]">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Checklist */}
          <section className="flex flex-col gap-5">
            <h2 className={h2}>{t("checklistHeading")}</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {checklist.map((item) => (
                <li key={item.title} className="rounded-2xl bg-white p-5 shadow-[0_1px_8px_rgba(0,0,0,0.05)]">
                  <h3 className="flex items-start gap-2 text-[17px] font-semibold leading-[25px]">
                    <M name="check_circle" size={20} className="mt-0.5 shrink-0 text-[#3525cd]" />
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-[25px] text-[#464555]">{item.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className={h2}>{t("costHeading")}</h2>
            <p className={body}>{t("costBody")}</p>
          </section>

          {/* Where Staffra fits */}
          <section className="rounded-2xl bg-[#1b1b24] p-6 text-white md:p-8">
            <h2 className="text-balance text-[24px] font-bold leading-[1.25]">{t("staffraHeading")}</h2>
            <p className="mt-3 text-[16px] leading-[27px] text-[#d4d2e3]">{t("staffraBody", { price: ENTRY_PRICE_MONTH })}</p>
            <Link
              href={hire}
              aria-label={tv("common.ctaTrial")}
              className="group mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-[15px] font-semibold text-[#1b1b24] transition-colors hover:bg-[#f0edff]"
            >
              <CascadeText text={tv("common.ctaTrial")} />
              <M name="arrow_forward" size={18} />
            </Link>
          </section>

          {/* By trade */}
          <section className="flex flex-col gap-4">
            <h2 className={h2}>{t("tradesHeading")}</h2>
            <p className={body}>{t("tradesIntro")}</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {VERTICALS.map((v) => (
                <li key={v.slug}>
                  <Link
                    href={localizedPath(locale, verticalPath(v))}
                    className="flex h-full flex-col gap-1 rounded-2xl bg-white p-4 shadow-[0_1px_8px_rgba(0,0,0,0.05)] transition-colors hover:text-[#3525cd]"
                  >
                    <span className="text-[16px] font-semibold">{tv(`${v.key}.navLabel`)}</span>
                    <span className="text-[14px] leading-[22px] text-[#464555]">{tv(`${v.key}.cardLine`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className={h2}>{tv("common.faqHeading")}</h2>
            {faq.map((entry) => (
              <details key={entry.q} className="group rounded-2xl bg-white p-5 shadow-[0_1px_8px_rgba(0,0,0,0.05)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold leading-[24px] [&::-webkit-details-marker]:hidden">
                  {entry.q}
                  <M name="expand_more" size={22} className="shrink-0 text-[#464555] transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-[15px] leading-[25px] text-[#464555]">{entry.a}</p>
              </details>
            ))}
          </section>
        </article>
      </main>

      <SiteFooter locale={locale} onLanding={false} />
    </div>
  );
}
