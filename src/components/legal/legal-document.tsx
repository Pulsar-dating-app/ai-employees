import Link from "next/link";
import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { landingV2Sans } from "@/components/landing/fonts";
import logo from "../../../public/logo.png";

// Shared shell for the public legal pages (/privacy, /terms). Self-contained
// with inline hex colors and the Inter face, matching landing-page-2.tsx --
// these pages sit next to the landing, not inside the dashboard design
// system. All copy resolves from the `Legal` namespace in messages/{en,pt}.json,
// so the site-wide language toggle (cookie + router.refresh) drives them like
// every other surface.

type LegalDoc = "privacy" | "terms";

type Section = { heading: string; paragraphs: string[] };

function slugify(heading: string) {
  return heading
    .toLowerCase()
    .replace(/^\d+\.\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function LegalDocument({ doc }: { doc: LegalDoc }) {
  const t = await getTranslations("Legal");
  const locale = await getLocale();

  const title = t(`${doc}.title`);
  const date = t(`${doc}.date`);
  const intro = t(`${doc}.intro`);
  const sections = t.raw(`${doc}.sections`) as Section[];
  const other: LegalDoc = doc === "privacy" ? "terms" : "privacy";

  return (
    <div
      className={`${landingV2Sans.className} min-h-screen bg-[#f8f9fa] text-[#191c1d] antialiased [&_section]:scroll-mt-24`}
    >
      <nav className="sticky top-0 z-50 border-b border-[#edeeef] bg-[#f8f9fa]/80 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[880px] items-center justify-between px-4 md:px-6">
          <Link href="/">
            <Image src={logo} alt="Staffra" className="h-11 w-auto" priority />
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale as "en" | "pt"} />
            <Link
              href="/"
              className="text-[14px] font-medium text-[#464555] transition-colors hover:text-[#3525cd]"
            >
              {t("nav.back")}
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[880px] px-4 py-12 md:px-6 md:py-16">
        <header className="mb-10 border-b border-[#e7e8e9] pb-8">
          <h1 className="text-[32px] font-bold leading-[40px] tracking-tight text-[#191c1d] md:text-[40px] md:leading-[48px]">
            {title}
          </h1>
          <p className="mt-3 text-[14px] text-[#464555]">
            {t("lastUpdated", { date })}
          </p>
          <p className="mt-6 text-[16px] leading-[26px] text-[#464555]">{intro}</p>
        </header>

        <nav aria-label={t("toc")} className="mb-12">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-[#191c1d]">
            {t("toc")}
          </h2>
          <ol className="flex flex-col gap-1.5">
            {sections.map((s) => (
              <li key={s.heading}>
                <a
                  href={`#${slugify(s.heading)}`}
                  className="text-[15px] leading-[22px] text-[#464555] transition-colors hover:text-[#3525cd]"
                >
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex flex-col gap-10">
          {sections.map((s) => (
            <section key={s.heading} id={slugify(s.heading)}>
              <h2 className="mb-3 text-[20px] font-bold leading-[28px] text-[#191c1d]">
                {s.heading}
              </h2>
              <div className="flex flex-col gap-3">
                {s.paragraphs.map((p, i) => (
                  <p
                    key={i}
                    className="text-[16px] leading-[26px] text-[#464555]"
                  >
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-16 flex flex-col gap-3 border-t border-[#e7e8e9] pt-8 text-[15px] text-[#464555] sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`/${other}`}
            className="font-medium text-[#3525cd] transition-colors hover:brightness-90"
          >
            {t(`${other}.title`)}
          </Link>
          <Link
            href="/"
            className="transition-colors hover:text-[#3525cd]"
          >
            {t("nav.back")}
          </Link>
        </footer>
      </main>
    </div>
  );
}
