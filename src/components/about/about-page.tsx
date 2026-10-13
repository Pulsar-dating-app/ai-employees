import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { HREFLANG, localizeHref, localizedPath } from "@/i18n/routing";
import { COMPANY, SITE_URL, absoluteUrl } from "@/lib/seo/site";
import { buildAboutPageGraph } from "@/lib/seo/structured-data";
import { VERTICALS, verticalPath } from "@/lib/verticals/catalog";
import { GUIDES, guidePath } from "@/lib/guides/catalog";
import { landingV2Sans } from "@/components/landing/fonts";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { CascadeText } from "@/components/landing/cascade-text";
import { M } from "@/components/landing/landing-icons";
import { LANDING_PLANS } from "@/components/landing/landing-plans";
import { JsonLdScript, loadSchemaContext } from "@/components/seo/schema-context";

// /sobre — who Staffra is. Written for people and for the search engines and
// AI assistants that need to identify the company: the canonical brand
// definition, who it's for, how it works, what it won't do, a fact sheet in
// short quotable lines, and the legal identity (PULSAR LTDA, CNPJ, contact).
// Company data comes from COMPANY (src/lib/seo/site.ts); copy from `About`
// and `Brand` in messages/*.json.

type Item = { title: string; body: string };
type Fact = { label: string; value: string };

const BRL_WHOLE = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const ENTRY_PRICE_MONTH = BRL_WHOLE.format(LANDING_PLANS[0].ownCents / 100);

export async function AboutPage() {
  const locale = (await getLocale()) as Locale;
  const [t, brand, tv, tg, { site }] = await Promise.all([
    getTranslations("About"),
    getTranslations("Brand"),
    getTranslations("Verticals"),
    getTranslations("Guides"),
    loadSchemaContext(),
  ]);

  const steps = t.raw("steps") as Item[];
  const principles = t.raw("principles") as Item[];
  // Facts carry an optional {price} placeholder, so they go through t() one by one.
  const facts = (t.raw("facts") as Fact[]).map((_, i) => ({
    label: t(`facts.${i}.label`),
    value: t(`facts.${i}.value`, { price: ENTRY_PRICE_MONTH }),
  }));

  const home = localizedPath(locale, "/");
  const pageUrl = absoluteUrl(localizedPath(locale, "/sobre"));
  const hire = localizeHref(locale, "/?auth=signup");
  const guide = GUIDES[0];

  const graph = buildAboutPageGraph({
    site,
    url: pageUrl,
    name: t("seoTitle"),
    description: t("seoDescription", { legalName: COMPANY.legalName, taxId: COMPANY.taxId }),
    inLanguage: HREFLANG[locale],
    breadcrumbs: [
      { name: tv("common.breadcrumbHome"), url: absoluteUrl(home) },
      { name: t("breadcrumb"), url: pageUrl },
    ],
  });

  const companyRows: Fact[] = [
    { label: t("company.legalName"), value: COMPANY.legalName },
    { label: t("company.taxId"), value: COMPANY.taxId },
    { label: t("company.contact"), value: COMPANY.email },
    { label: t("company.website"), value: SITE_URL.replace(/^https?:\/\//, "") },
    { label: t("company.country"), value: t("company.countryValue") },
  ];

  return (
    <div
      className={`${landingV2Sans.className} landing-v2-root min-h-screen bg-[#fcf8ff] text-[#1b1b24] antialiased [&_section]:scroll-mt-24`}
    >
      <JsonLdScript graph={graph} />
      <SiteHeader locale={locale} onLanding={false} />

      <main className="w-full pt-16 sm:pt-20">
        <section className="bg-gradient-to-b from-[#f0edff] to-[#fcf8ff]">
          <div className="mx-auto max-w-[960px] px-4 pb-14 pt-8 md:px-10 lg:pb-20 lg:pt-14">
            <nav aria-label="Breadcrumb" className="mb-6 text-[13px] font-medium text-[#464555]">
              <ol className="flex items-center gap-1.5">
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
            <h1 className="mt-4 max-w-[820px] text-balance text-[34px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[46px]">
              {t("h1")}
            </h1>
            <p className="mt-5 max-w-[760px] text-[18px] leading-[30px] text-[#464555]">{brand("definition")}</p>
          </div>
        </section>

        {/* Who it's for */}
        <section className="mx-auto max-w-[960px] px-4 py-14 md:px-10">
          <h2 className="text-[26px] font-bold leading-[1.2] tracking-[-0.01em] sm:text-[32px]">{t("whoHeading")}</h2>
          <p className="mt-3 max-w-[720px] text-[17px] leading-[28px] text-[#464555]">{t("whoIntro")}</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {VERTICALS.map((v) => (
              <li key={v.slug}>
                <Link
                  href={localizedPath(locale, verticalPath(v))}
                  className="flex h-full items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-[0_1px_8px_rgba(0,0,0,0.05)] transition-colors hover:text-[#3525cd]"
                >
                  <span className="text-[16px] font-semibold">{tv(`${v.key}.navLabel`)}</span>
                  <M name="arrow_forward" size={18} className="shrink-0 text-[#3525cd]" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 max-w-[720px] text-[15px] leading-[25px] text-[#464555]">{t("whoSales")}</p>
        </section>

        {/* How it works */}
        <section className="bg-white">
          <div className="mx-auto max-w-[960px] px-4 py-14 md:px-10">
            <h2 className="text-[26px] font-bold leading-[1.2] tracking-[-0.01em] sm:text-[32px]">{t("howHeading")}</h2>
            <ol className="mt-8 grid gap-5 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="rounded-2xl border border-[#e4e1ee] p-6">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#3525cd]">
                    {tv("common.stepLabel", { n: i + 1 })}
                  </span>
                  <h3 className="mt-2 text-[18px] font-semibold leading-[26px]">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-[25px] text-[#464555]">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Principles */}
        <section className="mx-auto max-w-[960px] px-4 py-14 md:px-10">
          <h2 className="text-[26px] font-bold leading-[1.2] tracking-[-0.01em] sm:text-[32px]">
            {t("principlesHeading")}
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {principles.map((p) => (
              <article key={p.title} className="rounded-2xl bg-white p-6 shadow-[0_1px_8px_rgba(0,0,0,0.05)]">
                <h3 className="text-[18px] font-semibold leading-[26px]">{p.title}</h3>
                <p className="mt-2 text-[15px] leading-[25px] text-[#464555]">{p.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Fact sheet */}
        <section className="bg-white">
          <div className="mx-auto max-w-[960px] px-4 py-14 md:px-10">
            <h2 className="text-[26px] font-bold leading-[1.2] tracking-[-0.01em] sm:text-[32px]">{t("factsHeading")}</h2>
            <dl className="mt-8 divide-y divide-[#e4e1ee] rounded-2xl border border-[#e4e1ee]">
              {facts.map((fact) => (
                <div key={fact.label} className="grid gap-1 px-5 py-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-6">
                  <dt className="text-[14px] font-semibold text-[#464555]">{fact.label}</dt>
                  <dd className="text-[16px] leading-[26px]">{fact.value}</dd>
                </div>
              ))}
            </dl>
            <Link
              href={localizedPath(locale, guidePath(guide))}
              className="mt-6 inline-flex items-center gap-2 text-[15px] font-semibold text-[#3525cd] hover:underline"
            >
              {tg(`${guide.key}.title`)}
              <M name="arrow_forward" size={18} />
            </Link>
          </div>
        </section>

        {/* Company */}
        <section className="mx-auto max-w-[960px] px-4 py-14 md:px-10">
          <h2 className="text-[26px] font-bold leading-[1.2] tracking-[-0.01em] sm:text-[32px]">{t("companyHeading")}</h2>
          <p className="mt-3 max-w-[720px] text-[17px] leading-[28px] text-[#464555]">
            {t("companyBody", { legalName: COMPANY.legalName })}
          </p>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            {companyRows.map((row) => (
              <div key={row.label} className="rounded-2xl bg-white p-4 shadow-[0_1px_8px_rgba(0,0,0,0.05)]">
                <dt className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#464555]">{row.label}</dt>
                <dd className="mt-1 select-all text-[17px] font-semibold">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[960px] px-4 pb-20 md:px-10">
          <div className="rounded-2xl bg-gradient-to-r from-[#3525cd] via-[#4f46e5] to-[#006591] p-8 text-center text-white md:p-12">
            <h2 className="mx-auto max-w-[640px] text-balance text-[26px] font-bold leading-[1.25] sm:text-[30px]">
              {t("ctaHeading")}
            </h2>
            <Link
              href={hire}
              aria-label={tv("common.ctaTrial")}
              className="group mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-[15px] font-semibold text-[#3525cd] shadow-lg transition-colors hover:bg-[#f5f2ff]"
            >
              <CascadeText text={tv("common.ctaTrial")} />
              <M name="arrow_forward" size={18} />
            </Link>
            <p className="mt-3 text-[12px] font-semibold text-[#e2dfff]">{tv("common.finalFine")}</p>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} onLanding={false} />
    </div>
  );
}
