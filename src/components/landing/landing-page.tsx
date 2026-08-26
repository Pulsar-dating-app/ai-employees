import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { landingDisplay } from "./fonts";
import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { TrustBand } from "./trust-band";
import { TeamGrid } from "./team-grid";
import { Reveal } from "./reveal";
import { fetchPublicAgents } from "./agents";
import type { DemoMessage } from "./whatsapp-thread";

export async function LandingPage() {
  const t = await getTranslations("Landing");
  const locale = await getLocale();
  const agents = await fetchPublicAgents();
  const messages = t.raw("demo.messages") as DemoMessage[];
  const year = new Date().getFullYear();
  const lead = agents[0] ?? null;

  return (
    <div
      className={`landing min-h-screen bg-[var(--l-bg)] text-[var(--l-ink)] ${landingDisplay.variable}`}
      style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" }}
    >
      <header className="sticky top-0 z-40 border-b border-[var(--l-line)] bg-[var(--l-bg)]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <span
            className="text-[17px] font-bold tracking-[-0.03em]"
            style={{ fontFamily: "var(--font-landing-display)" }}
          >
            Sidde
          </span>
          <nav className="flex items-center gap-2 sm:gap-4">
            <a
              href="#how"
              className="hidden rounded-md px-2 py-1 text-[13.5px] font-medium text-[var(--l-sub)] transition-colors hover:text-[var(--l-ink)] sm:inline-block"
            >
              {t("nav.howItWorks")}
            </a>
            <a
              href="#team"
              className="hidden rounded-md px-2 py-1 text-[13.5px] font-medium text-[var(--l-sub)] transition-colors hover:text-[var(--l-ink)] sm:inline-block"
            >
              {t("nav.team")}
            </a>
            <LanguageSwitcher currentLocale={locale as "en" | "pt"} />
            <Link
              href="/login"
              className="rounded-md px-2 py-1 text-[13.5px] font-medium text-[var(--l-sub)] transition-colors hover:text-[var(--l-ink)]"
            >
              {t("nav.login")}
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg bg-[var(--l-indigo)] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--l-indigo-deep)]"
            >
              {t("nav.cta")}
            </Link>
          </nav>
        </div>
      </header>

      <Hero lead={lead} agents={agents} messages={messages} />

      <div id="how">
        <HowItWorks agents={agents} messages={messages} />
      </div>

      <TrustBand lead={lead} />

      <div id="team">
        <TeamGrid agents={agents} />
      </div>

      {/* The single committed color moment on the page. */}
      <section className="l-on-dark bg-[var(--l-indigo)]">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center lg:py-24">
          <Reveal>
            <h2
              className="mx-auto max-w-[19ch] text-balance text-[clamp(28px,3.6vw,44px)] font-bold leading-[1.08] tracking-[-0.03em] text-white"
              style={{ fontFamily: "var(--font-landing-display)" }}
            >
              {t("finalCta.heading")}
            </h2>
            <p className="mx-auto mt-4 max-w-[48ch] text-[15.5px] leading-relaxed text-white/75">
              {t("finalCta.sub")}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/sign-up"
                className="rounded-lg bg-white px-6 py-3 text-[14.5px] font-semibold text-[var(--l-indigo)] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)] transition-transform duration-200 hover:-translate-y-px"
              >
                {t("finalCta.button")}
              </Link>
              <Link
                href="/login"
                className="rounded-lg border border-white/25 px-6 py-3 text-[14.5px] font-semibold text-white transition-colors duration-200 hover:bg-white/10"
              >
                {t("nav.login")}
              </Link>
            </div>
            <p className="mt-5 text-[12.5px] text-white/60">{t("finalCta.reassurance")}</p>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-[var(--l-line)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-7 text-[12.5px] text-[var(--l-faint)]">
          <span>{t("footer.rights", { year })}</span>
          <span>{t("footer.tagline")}</span>
        </div>
      </footer>
    </div>
  );
}
