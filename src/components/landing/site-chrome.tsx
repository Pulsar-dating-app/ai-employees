import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { localizeHref, localizedPath } from "@/i18n/routing";
import { VERTICALS, verticalPath } from "@/lib/verticals/catalog";
import { COMPANY } from "@/lib/seo/site";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ScrollHeader } from "./scroll-header";
import { CascadeText } from "./cascade-text";
import { M } from "./landing-icons";
import logo from "../../../public/logo.png";

// The public site's header and footer, shared by the landing and the
// per-trade pages (/para/<slug>). Copy lives in `LandingV2.header` /
// `LandingV2.footer`. Their section links are in-page anchors (`#planos`)
// on the landing; anywhere else they're resolved against the home page of
// the visitor's language (`/en#planos`).

type FooterCol = { title: string; links: { label: string; href: string }[] };

function sectionHref(locale: Locale, href: string, onLanding: boolean): string {
  if (!href.startsWith("#")) return localizeHref(locale, href);
  return onLanding ? href : `${localizedPath(locale, "/")}${href}`;
}

export async function SiteHeader({ locale, onLanding = true }: { locale: Locale; onLanding?: boolean }) {
  const t = await getTranslations("LandingV2");
  const hire = localizeHref(locale, "/?auth=signup");
  const login = localizeHref(locale, "/?auth=login");

  return (
    <ScrollHeader>
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-2 px-4 sm:h-20 md:px-10">
        <Link href={localizedPath(locale, "/")} className="flex items-center gap-2">
          <Image src={logo} alt="Staffra" sizes="88px" className="h-7 w-auto object-contain sm:h-8" priority />
        </Link>

        <nav className="hidden items-center gap-2 lg:flex">
          {[
            { label: t("header.navAgents"), href: "#workforce" },
            { label: t("header.navChannels"), href: "#canais" },
            { label: t("header.navPricing"), href: "#planos" },
            { label: t("header.navDemo"), href: "#demo" },
          ].map((item) => (
            <a
              key={item.label}
              href={sectionHref(locale, item.href, onLanding)}
              className="rounded-lg px-3 py-2 text-[14px] font-semibold text-[#464555] transition-colors hover:bg-[#f5f2ff] hover:text-[#1b1b24]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher currentLocale={locale} />
          <Link
            href={login}
            aria-label={t("header.login")}
            className="group inline-flex h-9 items-center justify-center rounded-lg px-2 text-[14px] font-semibold text-[#1b1b24] transition-colors hover:bg-[#f5f2ff] hover:text-[#3525cd] sm:h-11 sm:px-3"
          >
            <CascadeText text={t("header.login")} />
          </Link>
          <Link
            href={hire}
            aria-label={t("header.trial")}
            className="group inline-flex h-9 items-center justify-center rounded-lg bg-[#3525cd] px-3.5 text-[14px] font-semibold text-white shadow-[0_4px_32px_rgba(79,70,229,0.04)] transition-all hover:bg-[#4f46e5] hover:text-[#dad7ff] sm:h-11 sm:px-6"
          >
            <CascadeText text={t("header.trial")} />
          </Link>
        </div>
      </div>
    </ScrollHeader>
  );
}

export async function SiteFooter({ locale, onLanding = true }: { locale: Locale; onLanding?: boolean }) {
  const [t, tv, brand] = await Promise.all([
    getTranslations("LandingV2"),
    getTranslations("Verticals"),
    getTranslations("Brand"),
  ]);
  const footerCols = t.raw("footer.columns") as FooterCol[];
  // Links to every per-trade page from every public page — the internal
  // links that tell search engines those pages exist and matter.
  const verticalsCol: FooterCol = {
    title: tv("common.footerTitle"),
    links: VERTICALS.map((v) => ({ label: tv(`${v.key}.navLabel`), href: verticalPath(v) })),
  };

  return (
    <footer className="w-full bg-white pb-12 pt-12 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="mx-auto max-w-[1440px] px-4 md:px-10">
        <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-6">
          <div className="flex flex-col items-start gap-3 lg:col-span-2">
            <Image src={logo} alt="Staffra" sizes="88px" className="h-8 w-auto self-start object-contain" />
            <p className="max-w-sm text-[15px] leading-[24px] text-[#464555]">{brand("definition")}</p>
            <div className="flex items-center gap-3 pt-2">
              {["share", "public", "mail"].map((icon) => (
                <span
                  key={icon}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f2ff] text-[#464555]"
                >
                  <M name={icon} size={20} />
                </span>
              ))}
            </div>
          </div>
          {[verticalsCol, ...footerCols].map((col) => (
            <div key={col.title} className="flex flex-col gap-1.5">
              <span className="mb-2 text-[14px] font-semibold text-[#1b1b24]">{col.title}</span>
              {col.links.map((link) => (
                <a
                  key={link.label}
                  href={sectionHref(locale, link.href, onLanding)}
                  className="text-[14px] leading-[24px] text-[#464555] transition-colors hover:text-[#1b1b24]"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center justify-between gap-2 pt-6 text-[12px] font-semibold tracking-[0.02em] text-[#464555] md:flex-row">
          <p>{t("footer.rights")}</p>
          {/* The legal identity on every public page — it's what tells this
              Staffra apart from other companies with the same name. */}
          <p className="text-center font-medium md:text-right">
            {brand("legalLine", { legalName: COMPANY.legalName, taxId: COMPANY.taxId })} ·{" "}
            <span className="select-all">{COMPANY.email}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
