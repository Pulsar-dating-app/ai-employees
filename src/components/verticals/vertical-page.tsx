import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { HREFLANG, localizeHref, localizedPath } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/seo/site";
import { buildVerticalPageGraph } from "@/lib/seo/structured-data";
import { GUIDES, guidePath } from "@/lib/guides/catalog";
import { JsonLdScript, loadSchemaContext } from "@/components/seo/schema-context";
import { VERTICALS, verticalPath, verticalVideo, type Vertical } from "@/lib/verticals/catalog";
import { landingV2Sans } from "@/components/landing/fonts";
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { CascadeText } from "@/components/landing/cascade-text";
import { M } from "@/components/landing/landing-icons";
import { LANDING_PLANS } from "@/components/landing/landing-plans";

// A per-trade landing page (/para/<slug>, see src/lib/verticals/catalog.ts).
// Same visual language as the home landing (Inter, the Stitch palette,
// shared header/footer) but a plain server-rendered document: every word
// the page ranks for — including the sample chat — is real text in the
// HTML, not inside the demo video. All copy is `Verticals.<key>` /
// `Verticals.common` in messages/*.json.

type Item = { title: string; body: string };
type ChatLine = { from: "customer" | "agent"; text: string };
type Faq = { q: string; a: string };

const BRL_WHOLE = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const ENTRY_CENTS = LANDING_PLANS[0].ownCents;
const ENTRY_PRICE_MONTH = BRL_WHOLE.format(ENTRY_CENTS / 100);
const ENTRY_PRICE_DAY = BRL_WHOLE.format(Math.ceil(ENTRY_CENTS / 30 / 100));

const FEATURE_ICONS = ["account_tree", "bolt", "verified", "chat_bubble", "mail", "public"];

export async function VerticalPage({ vertical }: { vertical: Vertical }) {
  const locale = (await getLocale()) as Locale;
  const [t, tg, { site, plans }] = await Promise.all([
    getTranslations("Verticals"),
    getTranslations("Guides"),
    loadSchemaContext(),
  ]);
  const k = vertical.key;

  const pains = t.raw(`${k}.pains`) as Item[];
  const chat = t.raw(`${k}.chat`) as ChatLine[];
  const features = t.raw(`${k}.features`) as Item[];
  const steps = t.raw(`${k}.steps`) as Item[];
  const faq = t.raw(`${k}.faq`) as Faq[];

  const hire = localizeHref(locale, "/?auth=signup");
  const home = localizedPath(locale, "/");
  const pageUrl = absoluteUrl(localizedPath(locale, verticalPath(vertical)));
  const video = verticalVideo(vertical);
  const others = VERTICALS.filter((v) => v.slug !== vertical.slug);

  const guide = GUIDES[0];

  const graph = buildVerticalPageGraph({
    site,
    plans,
    trade: t(`${k}.navLabel`),
    url: pageUrl,
    name: t(`${k}.seoTitle`),
    description: t(`${k}.seoDescription`),
    inLanguage: HREFLANG[locale],
    breadcrumbs: [
      { name: t("common.breadcrumbHome"), url: absoluteUrl(home) },
      { name: t(`${k}.navLabel`), url: pageUrl },
    ],
    video: {
      name: t(`${k}.videoName`),
      description: t(`${k}.videoDescription`),
      thumbnailUrl: absoluteUrl(video.poster),
      contentUrl: absoluteUrl(video.src),
      uploadDate: vertical.videoUploaded,
      duration: video.duration,
    },
  });

  return (
    <div
      className={`${landingV2Sans.className} landing-v2-root min-h-screen scroll-smooth bg-[#fcf8ff] text-[#1b1b24] antialiased [&_section]:scroll-mt-24`}
    >
      <JsonLdScript graph={graph} />
      <SiteHeader locale={locale} onLanding={false} />

      <main className="w-full pt-16 sm:pt-20">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#f0edff] to-[#fcf8ff]">
          <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 pb-16 pt-8 md:px-10 lg:grid-cols-[1fr_auto] lg:gap-16 lg:pb-24 lg:pt-14">
            <div className="flex max-w-[640px] flex-col items-start">
              <nav aria-label="Breadcrumb" className="mb-6 text-[13px] font-medium text-[#464555]">
                <ol className="flex items-center gap-1.5">
                  <li>
                    <Link href={home} className="hover:text-[#3525cd]">
                      {t("common.breadcrumbHome")}
                    </Link>
                  </li>
                  <li aria-hidden="true">›</li>
                  <li aria-current="page" className="text-[#1b1b24]">
                    {t(`${k}.navLabel`)}
                  </li>
                </ol>
              </nav>
              <span className="rounded-full bg-[#e2dfff] px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#3525cd]">
                {t(`${k}.eyebrow`)}
              </span>
              <h1 className="mt-4 text-balance text-[34px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[48px]">
                {t(`${k}.h1`)}
              </h1>
              <p className="mt-5 text-[17px] leading-[28px] text-[#464555] sm:text-[18px]">{t(`${k}.sub`)}</p>
              <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Link
                  href={hire}
                  aria-label={t("common.ctaTrial")}
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#3525cd] px-6 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(53,37,205,0.7)] transition-colors hover:bg-[#4f46e5]"
                >
                  <CascadeText text={t("common.ctaTrial")} />
                  <M name="arrow_forward" size={18} />
                </Link>
                <a
                  href="#demo"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#c7c4d8] bg-white px-6 text-[15px] font-semibold text-[#1b1b24] transition-colors hover:border-[#3525cd] hover:text-[#3525cd]"
                >
                  <M name="play_circle" size={20} />
                  {t("common.ctaVideo")}
                </a>
              </div>
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-semibold text-[#464555]">
                {[
                  t("common.trustOfficial"),
                  t("common.trustPrice", { price: ENTRY_PRICE_DAY }),
                  t("common.trustCancel"),
                ].map((label) => (
                  <li key={label} className="flex items-center gap-1.5">
                    <M name="check_circle" size={16} className="text-[#3525cd]" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>

            <figure id="demo" className="mx-auto w-full max-w-[300px] lg:max-w-[320px]">
              <video
                controls
                playsInline
                preload="none"
                poster={video.poster}
                width={720}
                height={1280}
                aria-label={t(`${k}.videoName`)}
                className="aspect-[9/16] w-full rounded-[28px] bg-[#1b1b24] object-cover shadow-[0_30px_60px_-20px_rgba(53,37,205,0.45)]"
              >
                <source src={video.src} type="video/mp4" />
                {t("common.videoUnsupported")}
              </video>
              <figcaption className="mt-3 text-center text-[13px] font-medium text-[#464555]">
                {t("common.videoCaption")}
              </figcaption>
            </figure>
          </div>
        </section>

        {/* What it is — a direct, quotable answer to the trade's main question */}
        <section className="mx-auto max-w-[1200px] px-4 pt-16 md:px-10 lg:pt-20">
          <div className="max-w-[820px] border-l-4 border-[#3525cd] pl-5 md:pl-7">
            <h2 className="text-balance text-[24px] font-bold leading-[1.25] tracking-[-0.01em] sm:text-[30px]">
              {t(`${k}.whatIsHeading`)}
            </h2>
            <p className="mt-3 text-[17px] leading-[29px] text-[#464555]">{t(`${k}.whatIs`)}</p>
          </div>
        </section>

        {/* Pains */}
        <section className="mx-auto max-w-[1200px] px-4 py-16 md:px-10 lg:py-20">
          <h2 className="max-w-[760px] text-balance text-[28px] font-bold leading-[1.2] tracking-[-0.01em] sm:text-[36px]">
            {t(`${k}.painHeading`)}
          </h2>
          <p className="mt-4 max-w-[720px] text-[17px] leading-[28px] text-[#464555]">{t(`${k}.painIntro`)}</p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {pains.map((pain) => (
              <article key={pain.title} className="rounded-2xl bg-white p-6 shadow-[0_1px_8px_rgba(0,0,0,0.05)]">
                <h3 className="text-[18px] font-semibold leading-[26px]">{pain.title}</h3>
                <p className="mt-2 text-[15px] leading-[25px] text-[#464555]">{pain.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Sample chat */}
        <section className="bg-white">
          <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-16 md:px-10 lg:grid-cols-2 lg:py-20">
            <div>
              <h2 className="text-balance text-[28px] font-bold leading-[1.2] tracking-[-0.01em] sm:text-[36px]">
                {t(`${k}.chatHeading`)}
              </h2>
              <p className="mt-4 max-w-[520px] text-[17px] leading-[28px] text-[#464555]">{t(`${k}.chatIntro`)}</p>
            </div>
            <div className="mx-auto w-full max-w-[440px] overflow-hidden rounded-3xl border border-[#e4e1ee] bg-[#f8f7fc] shadow-[0_20px_50px_-24px_rgba(27,27,36,0.35)]">
              <div className="flex items-center justify-between border-b border-[#e4e1ee] bg-white px-5 py-3">
                <div>
                  <p className="text-[15px] font-semibold">{t(`${k}.chatBusiness`)}</p>
                  <p className="flex items-center gap-1.5 text-[12px] text-[#1f8a4c]">
                    <span className="h-2 w-2 rounded-full bg-[#22c55e]" aria-hidden="true" />
                    {t("common.chatOnline")}
                  </p>
                </div>
                <span className="rounded-full bg-[#f0edff] px-2.5 py-1 text-[11px] font-semibold text-[#3525cd]">
                  {t("common.chatSample")}
                </span>
              </div>
              <ol className="flex flex-col gap-2.5 px-4 py-5">
                {chat.map((line, i) => (
                  <li
                    key={i}
                    className={
                      line.from === "customer"
                        ? "ml-10 self-end rounded-2xl rounded-br-md bg-[#3525cd] px-3.5 py-2.5 text-[14px] leading-[21px] text-white"
                        : "mr-10 self-start rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[14px] leading-[21px] text-[#1b1b24] shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                    }
                  >
                    {line.text}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-[1200px] px-4 py-16 md:px-10 lg:py-20">
          <h2 className="max-w-[760px] text-balance text-[28px] font-bold leading-[1.2] tracking-[-0.01em] sm:text-[36px]">
            {t(`${k}.featuresHeading`)}
          </h2>
          <p className="mt-4 max-w-[720px] text-[17px] leading-[28px] text-[#464555]">{t(`${k}.featuresIntro`)}</p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <article key={feature.title} className="rounded-2xl bg-white p-6 shadow-[0_1px_8px_rgba(0,0,0,0.05)]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0edff] text-[#3525cd]">
                  <M name={FEATURE_ICONS[i % FEATURE_ICONS.length]} size={22} />
                </span>
                <h3 className="mt-4 text-[18px] font-semibold leading-[26px]">{feature.title}</h3>
                <p className="mt-2 text-[15px] leading-[25px] text-[#464555]">{feature.body}</p>
              </article>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-[#d9d4ff] bg-[#f5f2ff] p-6 md:p-8">
            <h3 className="text-[20px] font-semibold leading-[28px]">{t(`${k}.spotlightHeading`)}</h3>
            <p className="mt-3 max-w-[860px] text-[16px] leading-[27px] text-[#464555]">{t(`${k}.spotlightBody`)}</p>
          </div>
        </section>

        {/* Steps + pricing */}
        <section className="bg-white">
          <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-10 lg:py-20">
            <h2 className="text-balance text-[28px] font-bold leading-[1.2] tracking-[-0.01em] sm:text-[36px]">
              {t(`${k}.stepsHeading`)}
            </h2>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="rounded-2xl border border-[#e4e1ee] p-6">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#3525cd]">
                    {t("common.stepLabel", { n: i + 1 })}
                  </span>
                  <h3 className="mt-2 text-[18px] font-semibold leading-[26px]">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-[25px] text-[#464555]">{step.body}</p>
                </li>
              ))}
            </ol>

            <div className="mt-10 flex flex-col gap-6 rounded-2xl bg-[#1b1b24] p-6 text-white md:flex-row md:items-center md:justify-between md:p-8">
              <div className="max-w-[720px]">
                <h3 className="text-[20px] font-semibold">{t("common.pricingHeading")}</h3>
                <p className="mt-2 text-[15px] leading-[25px] text-[#d4d2e3]">
                  {t("common.pricingBody", { price: ENTRY_PRICE_MONTH })}
                </p>
              </div>
              <a
                href={`${home}#planos`}
                className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-white px-6 text-[15px] font-semibold text-[#1b1b24] transition-colors hover:bg-[#f0edff]"
              >
                {t("common.pricingCta")}
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-[880px] px-4 py-16 md:px-10 lg:py-20">
          <h2 className="text-[28px] font-bold leading-[1.2] tracking-[-0.01em] sm:text-[36px]">{t("common.faqHeading")}</h2>
          <div className="mt-8 flex flex-col gap-3">
            {faq.map((entry) => (
              <details key={entry.q} className="group rounded-2xl bg-white p-5 shadow-[0_1px_8px_rgba(0,0,0,0.05)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold leading-[24px] [&::-webkit-details-marker]:hidden">
                  {entry.q}
                  <M name="expand_more" size={22} className="shrink-0 text-[#464555] transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-[15px] leading-[25px] text-[#464555]">{entry.a}</p>
              </details>
            ))}
          </div>

          <Link
            href={localizedPath(locale, guidePath(guide))}
            className="mt-12 flex items-center justify-between gap-4 rounded-2xl border border-[#d9d4ff] bg-[#f5f2ff] p-5 transition-colors hover:border-[#3525cd]"
          >
            <span>
              <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-[#3525cd]">
                {t("common.guideLabel")}
              </span>
              <span className="mt-1 block text-[16px] font-semibold leading-[24px]">{tg(`${guide.key}.title`)}</span>
            </span>
            <M name="arrow_forward" size={20} className="shrink-0 text-[#3525cd]" />
          </Link>

          {others.length > 0 ? (
            <div className="mt-12">
              <h2 className="text-[16px] font-semibold text-[#464555]">{t("common.othersHeading")}</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {others.map((other) => (
                  <li key={other.slug}>
                    <Link
                      href={localizedPath(locale, verticalPath(other))}
                      className="inline-flex rounded-full border border-[#c7c4d8] bg-white px-4 py-2 text-[14px] font-semibold text-[#1b1b24] transition-colors hover:border-[#3525cd] hover:text-[#3525cd]"
                    >
                      {t(`${other.key}.navLabel`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-[1200px] px-4 pb-20 md:px-10">
          <div className="rounded-2xl bg-gradient-to-r from-[#3525cd] via-[#4f46e5] to-[#006591] p-8 text-center text-white shadow-[0_20px_50px_rgba(53,37,205,0.25)] md:p-12">
            <h2 className="mx-auto max-w-[720px] text-balance text-[26px] font-bold leading-[1.25] sm:text-[32px]">
              {t(`${k}.finalHeading`)}
            </h2>
            <p className="mx-auto mt-3 max-w-[600px] text-[16px] leading-[26px] text-[#dad7ff]">{t(`${k}.finalSub`)}</p>
            <Link
              href={hire}
              aria-label={t("common.ctaTrial")}
              className="group mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-[15px] font-semibold text-[#3525cd] shadow-lg transition-colors hover:bg-[#f5f2ff]"
            >
              <CascadeText text={t("common.ctaTrial")} />
              <M name="arrow_forward" size={18} />
            </Link>
            <p className="mt-3 text-[12px] font-semibold text-[#e2dfff]">{t("common.finalFine")}</p>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} onLanding={false} />
    </div>
  );
}
