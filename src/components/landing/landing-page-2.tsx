import Link from "next/link";
import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { WhatsAppThread, type DemoMessage } from "./whatsapp-thread";
import { landingV2Sans } from "./fonts";
import heroImg from "../../../public/landing-v2/hero.jpg";
import maluImg from "../../../public/landing-v2/malu.jpg";
import dashboardImg from "../../../public/landing-v2/dashboard.jpg";

// Version B of the public landing — a faithful reproduction of the Stitch
// "Staffra Human-Centric AI" mockup (Corporate Modern + tactile warmth: soft
// off-white surfaces, Professional Indigo, generous whitespace, 2xl rounded
// cards, ambient shadows). Palette + type scale are taken straight from that
// design system. Lives on its own route so none of it leaks into Version A;
// the fixed <LandingSwitcher> at the bottom flips between the two.
//
// Design tokens (Staffra Human-Centric AI):
//   surface #f8f9fa · container-lowest #ffffff · container-low #f3f4f5
//   container-high #e7e8e9 · on-surface #191c1d · on-surface-variant #464555
//   primary #3525cd · primary-container #4f46e5 · primary-fixed #e2dfff
//   secondary #006c49 · status-green #3de272 · whatsapp #25d366

const CARD =
  "rounded-2xl border border-[#e7e8e9] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)]";
const BTN_PRIMARY =
  "inline-flex h-12 items-center justify-center rounded-lg bg-[#3525cd] px-8 text-[14px] font-medium text-white transition-all hover:brightness-90";
const BTN_NEUTRAL =
  "inline-flex h-12 items-center justify-center rounded-lg bg-[#edeeef] px-8 text-[14px] font-medium text-[#191c1d] transition-colors hover:bg-[#e7e8e9]";

const ICONS: Record<string, React.ReactNode> = {
  heart: (
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.5 4.04 3 5.5l7 7Z" />
  ),
  badgeCheck: (
    <>
      <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  book: (
    <>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </>
  ),
  userPlus: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </>
  ),
  fileUp: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M12 12v6" />
      <path d="m9 15 3-3 3 3" />
    </>
  ),
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  trendingUp: (
    <>
      <path d="M16 7h6v6" />
      <path d="m22 7-8.5 8.5-5-5L2 17" />
    </>
  ),
  cart: (
    <>
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

function Icon({ name, className }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

const SPOTLIGHT_FEATURES = [
  { key: "warm", icon: "heart" },
  { key: "negotiator", icon: "badgeCheck" },
  { key: "expert", icon: "book" },
] as const;

const FLOW_STEPS = [
  { key: "hire", icon: "userPlus", whatsapp: false },
  { key: "teach", icon: "fileUp", whatsapp: false },
  { key: "connect", icon: "chat", whatsapp: true },
  { key: "work", icon: "activity", whatsapp: false },
] as const;

export async function LandingPageV2() {
  const t = await getTranslations("LandingV2");
  const locale = await getLocale();
  const year = new Date().getFullYear();
  const demoMessages = t.raw("demo.messages") as DemoMessage[];

  return (
    <div
      className={`${landingV2Sans.className} min-h-screen bg-[#f8f9fa] text-[#191c1d] antialiased [scroll-behavior:smooth] [&_section]:scroll-mt-16`}
    >
      {/* Top nav */}
      <nav className="sticky top-0 z-50 border-b border-[#edeeef] bg-[#f8f9fa]/80 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-4 md:px-10">
          <span className="text-[24px] font-bold text-[#3525cd]">Staffra</span>
          <div className="hidden items-center gap-6 md:flex">
            <a
              href="#spotlight"
              className="text-[14px] font-medium text-[#464555] transition-colors hover:text-[#3525cd]"
            >
              {t("nav.features")}
            </a>
            <a
              href="#flow"
              className="text-[14px] font-medium text-[#464555] transition-colors hover:text-[#3525cd]"
            >
              {t("nav.employees")}
            </a>
            <a
              href="#measure"
              className="text-[14px] font-medium text-[#464555] transition-colors hover:text-[#3525cd]"
            >
              {t("nav.pricing")}
            </a>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale as "en" | "pt"} />
            <Link
              href="/?auth=login"
              className="hidden text-[14px] font-medium text-[#464555] transition-colors hover:text-[#3525cd] sm:inline-block"
            >
              {t("nav.login")}
            </Link>
            <Link
              href="/?auth=signup"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[#3525cd] px-5 text-[14px] font-medium text-white transition-all hover:brightness-90"
            >
              {t("nav.cta")}
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-[1280px] overflow-hidden px-4 py-10 md:px-10 md:py-24">
          <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2">
            <div className="z-10 flex flex-col gap-4">
              <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full bg-[#e7e8e9] px-3 py-1">
                <span className="h-2 w-2 rounded-full bg-[#3de272]" />
                <span className="text-[12px] font-semibold text-[#464555]">
                  {t("hero.badge")}
                </span>
              </div>
              <h1 className="text-[40px] font-bold leading-[1.1] tracking-[-0.02em] text-[#191c1d] md:text-[48px] md:leading-[56px]">
                {t("hero.headline")}
              </h1>
              <p className="max-w-xl text-[18px] leading-[28px] text-[#464555]">
                {t("hero.sub")}
              </p>
              <div className="mt-2 flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/?auth=signup"
                  className={`${BTN_PRIMARY} shadow-[0_4px_14px_0_rgba(53,37,205,0.39)]`}
                >
                  {t("hero.primaryCta")}
                </Link>
                <a href="#spotlight" className={BTN_NEUTRAL}>
                  {t("hero.secondaryCta")}
                </a>
              </div>
            </div>
            <div className="group relative overflow-hidden rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)]">
              <Image
                src={heroImg}
                alt={t("hero.imageAlt")}
                priority
                className="h-auto w-full rounded-2xl object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-t from-black/20 to-transparent" />
            </div>
          </div>
        </section>

        {/* Malu spotlight */}
        <section id="spotlight" className="bg-white py-24">
          <div className="mx-auto max-w-[1280px] px-4 md:px-10">
            <div className="relative overflow-hidden rounded-2xl border border-[#e7e8e9] bg-[#f8f9fa] p-8 shadow-sm md:p-12">
              <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
                <div className="relative z-10 order-2 flex flex-col gap-6 md:order-1">
                  <div>
                    <h2 className="mb-2 text-[32px] font-semibold leading-[40px] tracking-[-0.01em] text-[#191c1d]">
                      {t("spotlight.title")}
                    </h2>
                    <p className="text-[18px] leading-[28px] text-[#3525cd]">
                      {t("spotlight.tagline")}
                    </p>
                  </div>
                  <div className="space-y-4">
                    {SPOTLIGHT_FEATURES.map(({ key, icon }) => (
                      <div
                        key={key}
                        className="flex items-start gap-4 rounded-xl border border-[#f3f4f5] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)] transition-transform hover:-translate-y-0.5"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e2dfff] text-[#3525cd]">
                          <Icon name={icon} className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="text-[14px] font-bold text-[#191c1d]">
                            {t(`spotlight.features.${key}.title`)}
                          </h4>
                          <p className="mt-1 text-[16px] leading-[24px] text-[#464555]">
                            {t(`spotlight.features.${key}.description`)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Link href="/?auth=signup" className={`${BTN_PRIMARY} mt-4 w-fit`}>
                    {t("spotlight.cta")}
                  </Link>
                </div>
                <div className="relative order-1 md:order-2">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-2xl shadow-lg">
                    <Image
                      src={maluImg}
                      alt={t("spotlight.imageAlt")}
                      className="h-full w-full object-cover object-top"
                    />
                    <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-xl border border-white/30 bg-white/70 p-4 backdrop-blur-md">
                      <Icon name="shieldCheck" className="h-5 w-5 shrink-0 text-[#006c49]" />
                      <div className="flex flex-col">
                        <span className="text-[12px] font-semibold text-[#191c1d]">
                          {t("spotlight.badge")}
                        </span>
                        <span className="text-[12px] text-[#464555]">
                          {t("spotlight.badgeSub")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#4f46e5] opacity-20 blur-[80px]" />
                  <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-[#006c49] opacity-20 blur-[80px]" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* The flow */}
        <section id="flow" className="mx-auto max-w-[1280px] px-4 py-24 md:px-10">
          <div className="mb-16 text-center">
            <h2 className="text-[32px] font-semibold leading-[40px] tracking-[-0.01em] text-[#191c1d]">
              {t("flow.heading")}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[18px] leading-[28px] text-[#464555]">
              {t("flow.sub")}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {FLOW_STEPS.map(({ key, icon, whatsapp }, i) => (
              <div
                key={key}
                className={`${CARD} p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)]`}
              >
                <div
                  className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl"
                  style={
                    whatsapp
                      ? { backgroundColor: "rgba(37,211,102,0.2)", color: "#25d366" }
                      : { backgroundColor: "#e2dfff", color: "#3525cd" }
                  }
                >
                  <Icon name={icon} className="h-6 w-6" />
                </div>
                <span
                  className="mb-2 block text-[12px] font-semibold"
                  style={{ color: whatsapp ? "#25d366" : "#3525cd" }}
                >
                  {t("flow.stepLabel", { number: i + 1 })}
                </span>
                <h3 className="mb-3 text-[24px] font-semibold leading-[32px] text-[#191c1d]">
                  {t(`flow.steps.${key}.title`)}
                </h3>
                <p className="text-[16px] leading-[24px] text-[#464555]">
                  {t(`flow.steps.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Conversation comparison */}
        <section className="bg-[#f3f4f5] py-24">
          <div className="mx-auto max-w-[1280px] px-4 md:px-10">
            <div className="mb-16 text-center">
              <h2 className="text-[32px] font-semibold leading-[40px] tracking-[-0.01em] text-[#191c1d]">
                {t("comparison.heading")}
              </h2>
              <p className="mt-4 text-[18px] leading-[28px] text-[#464555]">
                {t("comparison.sub")}
              </p>
            </div>
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
              {/* Same WhatsApp frame on both sides — only the conversation differs. */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-[#ba1a1a]" />
                  <h3 className="text-[24px] font-semibold leading-[32px] text-[#191c1d]">
                    {t("comparison.oldWay")}
                  </h3>
                </div>
                <WhatsAppThread
                  animate={false}
                  contactName={t("comparison.oldContact")}
                  messages={[
                    { from: "customer", text: t("comparison.customerMessage") },
                    { from: "bot", text: t("comparison.botReply") },
                  ]}
                />
              </div>
              {/* The Staffra way — the live, typing thread */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-[#3de272]" />
                  <h3 className="text-[24px] font-semibold leading-[32px] text-[#3525cd]">
                    {t("comparison.staffraWay")}
                  </h3>
                </div>
                <WhatsAppThread
                  contactName="Malu"
                  avatarSrc={maluImg.src}
                  messages={demoMessages}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Measure what matters */}
        <section
          id="measure"
          className="mx-auto max-w-[1280px] overflow-hidden px-4 py-24 md:px-10"
        >
          <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
            <div className="order-2 rounded-2xl border border-[#e7e8e9] bg-white p-4 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] lg:order-1">
              <Image
                src={dashboardImg}
                alt={t("measure.imageAlt")}
                className="h-auto w-full rounded-xl object-cover"
              />
            </div>
            <div className="order-1 flex flex-col gap-6 lg:order-2">
              <h2 className="text-[32px] font-semibold leading-[40px] tracking-[-0.01em] text-[#191c1d]">
                {t("measure.heading")}
              </h2>
              <p className="text-[18px] leading-[28px] text-[#464555]">{t("measure.sub")}</p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-[#e7e8e9] bg-white p-6 shadow-sm">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#e2dfff] text-[#3525cd]">
                    <Icon name="trendingUp" className="h-5 w-5" />
                  </div>
                  <h4 className="mb-1 text-[14px] font-bold text-[#191c1d]">
                    {t("measure.intent.title")}
                  </h4>
                  <p className="text-[14px] leading-[20px] text-[#464555]">
                    {t("measure.intent.description")}
                  </p>
                </div>
                <div className="rounded-xl border border-[#e7e8e9] bg-white p-6 shadow-sm">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#6ffbbe] text-[#006c49]">
                    <Icon name="cart" className="h-5 w-5" />
                  </div>
                  <h4 className="mb-1 text-[14px] font-bold text-[#191c1d]">
                    {t("measure.checkout.title")}
                  </h4>
                  <p className="text-[14px] leading-[20px] text-[#464555]">
                    {t("measure.checkout.description")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e7e8e9] bg-white">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 px-4 py-8 md:grid-cols-4 md:px-10">
          <div className="flex flex-col gap-4">
            <span className="text-[24px] font-bold text-[#3525cd]">Staffra</span>
            <p className="max-w-xs text-[16px] leading-[24px] text-[#464555]">
              {t("footer.blurb")}
            </p>
          </div>
          <FooterColumn
            title={t("footer.product")}
            links={[
              t("footer.links.features"),
              t("footer.links.pricing"),
              t("footer.links.docs"),
            ]}
          />
          <FooterColumn
            title={t("footer.company")}
            links={[t("footer.links.careers"), t("footer.links.support")]}
          />
          <FooterColumn
            title={t("footer.legal")}
            links={[t("footer.links.privacy"), t("footer.links.terms")]}
          />
          <div className="col-span-1 mt-8 border-t border-[#e7e8e9] pt-8 md:col-span-4">
            <p className="text-[16px] leading-[24px] text-[#464555]">
              {t("footer.rights", { year })}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="mb-2 text-[12px] font-bold uppercase tracking-wider text-[#191c1d]">
        {title}
      </span>
      {links.map((label) => (
        <a
          key={label}
          href="#"
          className="text-[16px] leading-[24px] text-[#464555] transition-colors hover:text-[#3525cd]"
        >
          {label}
        </a>
      ))}
    </div>
  );
}
