import Link from "next/link";
import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { landingV2Sans } from "./fonts";
import { BrandLogo } from "./brand-logos";
import { ChannelShowcase, type ChannelItem } from "./channel-showcase";
import maluImg from "../../../public/agents/sales-1.png";
import anaImg from "../../../public/agents/secretary-1.png";
import workspaceImg from "../../../public/landing-v2/workspace.jpg";
import analyticsImg from "../../../public/landing-v2/analytics.jpg";
import logo from "../../../public/logo.png";

// Public landing — a faithful, pixel-level reproduction of the Stitch
// "Staffra - Landing Page Oficial" screen (project 16467959335975114559,
// screen 75c1da7a…). Palette, type scale, spacing rhythm and every string
// are taken straight from that mockup. The design system there uses a large
// custom Tailwind config; since this repo's Tailwind doesn't carry those
// token names, the classes below inline the resolved hex / pixel values.
//
// Design tokens (Stitch "Staffra Oficial"):
//   surface #fcf8ff · container-lowest #ffffff · container-low #f5f2ff
//   container-high #eae6f4 · on-surface #1b1b24 · on-surface-variant #464555
//   primary #3525cd · primary-container #4f46e5 · primary-fixed #e2dfff
//   secondary #006591 · secondary-fixed #c9e6ff · secondary-container #39b8fd
//   tertiary #7e3000 · tertiary-fixed #ffdbcc · neutral-900 #0f172a
//   neutral-500 #64748b · status-success #10b981 · error #ba1a1a
//
// NOTE: this page deliberately keeps the mockup's product wording verbatim
// ("agentes de IA", "AI Workforce", "RAG", model names, …). That runs against
// the product-language rules in CLAUDE.md, and was an explicit call by the
// owner to mirror the Stitch copy exactly.

const HIRE = "/?auth=signup";
const LOGIN = "/?auth=login";
const SALES = "/talk";

// Google Material Symbols — the icon set the Stitch export uses. The
// stylesheet defines the `.material-symbols-outlined` class itself, so the
// <link> is all that's needed. Next hoists it into <head>.
const MATERIAL_SYMBOLS_HREF =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200";

function M({
  name,
  className,
  size,
  fill,
}: {
  name: string;
  className?: string;
  size?: number;
  fill?: boolean;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={{
        fontSize: size ? `${size}px` : undefined,
        fontVariationSettings: fill ? '"FILL" 1' : undefined,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

type LogoItem = { name: string };
type Agent = {
  name: string;
  role: string;
  sub: string;
  desc: string;
  statLabel: string;
  statValue: string;
};
type Step = { title: string; desc: string };
type Source = { title: string; sub: string };
type Plan = {
  tier: string;
  name: string;
  desc: string;
  price: string;
  priceSuffix?: string;
  priceNote: string;
  features: string[];
  cta: string;
};
type Stat = { value: string; title: string; desc: string };
type Faq = { q: string; a: string };
type FooterCol = { title: string; links: { label: string; href: string }[] };

// Two real hired employees only — Malu (sales) and Ana (scheduling), each
// with a real portrait. There is no third "support" agent and no
// agent-to-agent collaboration in the product.
const AGENT_STYLES = [
  { img: maluImg, role: "text-[#3525cd]", btn: "text-[#3525cd] hover:bg-[#3525cd] hover:text-white" },
  { img: anaImg, role: "text-[#006591]", btn: "text-[#006591] hover:bg-[#006591] hover:text-white" },
] as const;

const SOURCE_ICONS = [
  { icon: "picture_as_pdf", color: "text-[#3525cd]" },
  { icon: "table_chart", color: "text-[#10b981]" },
  { icon: "link", color: "text-[#006591]" },
  { icon: "chat_bubble", color: "text-[#7e3000]" },
  { icon: "mic", color: "text-[#4f46e5]" },
  { icon: "database", color: "text-[#0f172a]" },
] as const;

const IMPACT_ACCENT = ["text-[#e2dfff]", "text-[#10b981]", "text-[#39b8fd]"] as const;

export async function LandingPageV2() {
  const t = await getTranslations("LandingV2");

  const logos = t.raw("socialProof.logos") as LogoItem[];
  const channels = t.raw("channels.items") as ChannelItem[];
  const agents = t.raw("workforce.agents") as Agent[];
  const steps = t.raw("rag.steps") as Step[];
  const sources = t.raw("rag.sources") as Source[];
  const plans = t.raw("pricing.plans") as Plan[];
  const stats = t.raw("impact.stats") as Stat[];
  const faqs = t.raw("faq.items") as Faq[];
  const footerCols = t.raw("footer.columns") as FooterCol[];

  return (
    <div
      className={`${landingV2Sans.className} min-h-screen scroll-smooth bg-[#fcf8ff] text-[#1b1b24] antialiased [&_section]:scroll-mt-24`}
    >
      <link rel="stylesheet" href={MATERIAL_SYMBOLS_HREF} />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-50 bg-white/80 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between gap-2 px-4 md:px-10">
          <Link href="/" className="flex items-center gap-2">
            <Image src={logo} alt="Staffra" className="h-8 w-auto object-contain" priority />
          </Link>

          <nav className="hidden items-center gap-2 lg:flex">
            <a
              href="#workforce"
              className="rounded-lg bg-[#eae6f4] px-3 py-2 text-[14px] font-semibold text-[#1b1b24]"
            >
              {t("header.navAgents")}
            </a>
            {[
              { label: t("header.navWorkforce"), href: "#workforce" },
              { label: t("header.navChannels"), href: "#canais" },
              { label: t("header.navPricing"), href: "#planos" },
              { label: t("header.navDemo"), href: "#demo" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="rounded-lg px-3 py-2 text-[14px] font-semibold text-[#464555] transition-colors hover:bg-[#f5f2ff] hover:text-[#1b1b24]"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <LanguageSwitcher currentLocale={(await getLocale()) as "en" | "pt"} />
            <Link
              href={LOGIN}
              className="inline-flex h-11 items-center justify-center rounded-lg px-3 text-[14px] font-semibold text-[#1b1b24] transition-colors hover:bg-[#f5f2ff] hover:text-[#3525cd]"
            >
              {t("header.login")}
            </Link>
            <Link
              href={HIRE}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-[#3525cd] px-6 text-[14px] font-semibold text-white shadow-[0_4px_32px_rgba(79,70,229,0.04)] transition-all hover:bg-[#4f46e5] hover:text-[#dad7ff]"
            >
              {t("header.trial")}
            </Link>
          </div>
        </div>
      </header>

      <main className="w-full bg-[#fcf8ff] pt-20">
        {/* ── 1. Hero ─────────────────────────────────────────── */}
        <div className="relative w-full overflow-hidden">
          <div className="pointer-events-none absolute -top-40 left-1/2 -z-0 h-[550px] w-[1000px] -translate-x-1/2 bg-gradient-to-b from-[#3525cd]/10 via-[#39b8fd]/10 to-transparent blur-3xl" />

          <section
            id="demo"
            className="mx-auto max-w-[1440px] px-4 pb-12 pt-6 md:px-10 md:pt-12"
          >
            <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 shadow-[0_4px_24px_rgba(79,70,229,0.08)]">
                <span className="flex h-2 w-2 animate-pulse rounded-full bg-[#10b981]" />
                <span className="text-[12px] font-semibold tracking-[0.02em] text-[#3525cd]">
                  {t("hero.badgeMain")}
                </span>
                <span className="hidden text-[12px] font-semibold tracking-[0.02em] text-[#464555] sm:inline">
                  {t("hero.badgeSub")}
                </span>
              </div>

              <h1 className="text-balance text-[40px] font-bold leading-none tracking-[-0.02em] text-[#0f172a] md:text-[48px]">
                {t("hero.headlinePre")}{" "}
                <span className="bg-gradient-to-r from-[#3525cd] via-[#4f46e5] to-[#006591] bg-clip-text text-transparent">
                  {t("hero.headlineHighlight")}
                </span>{" "}
                {t("hero.headlinePost")}
              </h1>

              <p className="mt-3 max-w-2xl text-balance text-[18px] leading-[28px] text-[#464555]">
                {t("hero.sub")}
              </p>

              <div className="mt-6 flex w-full flex-wrap items-center justify-center gap-2 sm:gap-3">
                <Link
                  href={HIRE}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#3525cd] px-6 py-3 text-[14px] font-semibold text-white shadow-[0_12px_32px_rgba(53,37,205,0.22)] transition-all hover:scale-[1.01] hover:bg-[#4f46e5]"
                >
                  <M name="bolt" size={20} />
                  {t("hero.ctaPrimary")}
                </Link>
                <a
                  href="#demo"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-[14px] font-semibold text-[#0f172a] shadow-[0_4px_20px_rgba(0,0,0,0.04)] transition-all hover:bg-[#f5f2ff]"
                >
                  <M name="play_circle" size={20} className="text-[#3525cd]" />
                  {t("hero.ctaSecondary")}
                </a>
                <Link
                  href={SALES}
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-[14px] font-semibold text-[#464555] transition-colors hover:text-[#3525cd]"
                >
                  {t("hero.ctaTertiary")}
                  <M name="arrow_forward" size={18} />
                </Link>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-6 text-[12px] font-semibold tracking-[0.02em] text-[#464555]">
                {[t("hero.trust1"), t("hero.trust2"), t("hero.trust3")].map((trust) => (
                  <span key={trust} className="flex items-center gap-1.5">
                    <M name="verified" size={16} className="text-[#10b981]" />
                    {trust}
                  </span>
                ))}
              </div>
            </div>

            {/* Hero showcase — dual platform card */}
            <div className="relative mt-12 w-full">
              <div className="relative w-full overflow-hidden rounded-xl bg-white p-3 shadow-[0_20px_50px_rgba(79,70,229,0.08)] sm:p-6">
                <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
                  {/* Left — live chat with Malu */}
                  <div className="flex flex-col rounded-lg bg-[#f5f2ff] p-3 lg:col-span-5">
                    <div className="mb-1 flex items-center justify-between pb-1">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Image
                            src={maluImg}
                            alt="Malu"
                            className="h-12 w-12 rounded-full object-cover object-center shadow-sm"
                          />
                          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-[#10b981] ring-2 ring-white" />
                        </div>
                        <div className="flex flex-col text-left">
                          <div className="flex items-center gap-1">
                            <span className="text-[14px] font-semibold text-[#0f172a]">
                              {t("hero.chat.agentName")}
                            </span>
                            <M name="verified" size={15} className="text-[#3525cd]" fill />
                          </div>
                          <span className="text-[12px] font-semibold text-[#10b981]">
                            {t("hero.chat.status")}
                          </span>
                        </div>
                      </div>
                      <span className="rounded-full bg-[#e2dfff] px-2 py-0.5 text-[12px] font-semibold text-[#0f0069]">
                        {t("hero.chat.badge")}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2 py-2 text-left text-[13px] leading-relaxed">
                      <div className="max-w-[85%] self-start rounded-xl rounded-tl-none bg-white p-3 text-[#0f172a] shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                        <p>{t("hero.chat.msg1")}</p>
                        <span className="mt-1 block text-right text-[10px] text-[#64748b]">10:42</span>
                      </div>
                      <div className="max-w-[85%] self-end rounded-xl rounded-tr-none bg-[#3525cd] p-3 text-white shadow-[0_2px_8px_rgba(53,37,205,0.15)]">
                        <p>{t("hero.chat.msg2")}</p>
                        <span className="mt-1 block text-right text-[10px] text-[#e2dfff]">10:43</span>
                      </div>
                      <div className="max-w-[90%] self-start rounded-xl rounded-tl-none bg-white p-3 text-[#0f172a] shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                        <p>{t("hero.chat.msg3a")}</p>
                        <div className="mt-2 flex items-center justify-between rounded bg-[#f5f2ff] p-2">
                          <div className="flex items-center gap-2">
                            <M name="shopping_bag" size={20} className="text-[#3525cd]" />
                            <span className="truncate text-[12px] font-semibold text-[#0f172a]">
                              {t("hero.chat.productName")}
                            </span>
                          </div>
                          <span className="text-[11px] font-semibold text-[#64748b]">
                            {t("hero.chat.productPrice")}
                          </span>
                        </div>
                        <p className="mt-2">{t("hero.chat.msg3b")}</p>
                        <span className="mt-1 block text-right text-[10px] text-[#64748b]">
                          {t("hero.chat.msg3meta")}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-white p-2 pt-2">
                      <M name="attach_file" size={20} className="text-[#64748b]" />
                      <input
                        className="w-full bg-transparent text-[13px] text-[#0f172a] outline-none placeholder:text-[#64748b]"
                        placeholder={t("hero.chat.inputPlaceholder")}
                        defaultValue={t("hero.chat.inputValue")}
                        readOnly
                        type="text"
                      />
                      <button
                        type="button"
                        aria-label={t("hero.chat.send")}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3525cd] text-white shadow-sm hover:bg-[#4f46e5]"
                      >
                        <M name="send" size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Right — workspace + metrics */}
                  <div className="flex flex-col gap-3 lg:col-span-7">
                    <div className="relative overflow-hidden rounded-lg shadow-sm">
                      <Image
                        src={workspaceImg}
                        alt={t("hero.workspace.imageAlt")}
                        className="h-auto w-full rounded-lg object-contain"
                      />
                      <div className="absolute inset-0 flex items-end bg-gradient-to-t from-[#0f172a]/60 via-transparent to-transparent p-3">
                        <div className="text-left text-white">
                          <p className="text-[12px] font-semibold uppercase tracking-wider text-[#e2dfff]">
                            {t("hero.workspace.eyebrow")}
                          </p>
                          <p className="text-[24px] font-bold leading-[32px]">
                            {t("hero.workspace.title")}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      {[
                        { label: t("hero.metrics.m1Label"), value: "89.4%", delta: "+14%", sub: t("hero.metrics.m1Sub"), color: "text-[#0f172a]" },
                        { label: t("hero.metrics.m2Label"), value: "1.4s", delta: "-98%", sub: t("hero.metrics.m2Sub"), color: "text-[#3525cd]" },
                        { label: t("hero.metrics.m3Label"), value: "1.240", delta: "3.8x", sub: t("hero.metrics.m3Sub"), color: "text-[#0f172a]" },
                      ].map((m) => (
                        <div key={m.label} className="rounded-lg bg-[#f5f2ff] p-3 text-left">
                          <span className="text-[12px] font-semibold text-[#64748b]">{m.label}</span>
                          <div className="mt-1 flex items-baseline gap-1">
                            <span className={`text-[24px] font-bold ${m.color}`}>{m.value}</span>
                            <span className="text-[12px] font-semibold text-[#10b981]">{m.delta}</span>
                          </div>
                          <span className="text-[11px] text-[#464555]">{m.sub}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ── 2. Social proof strip ───────────────────────────── */}
        <section className="w-full bg-[#f5f2ff] py-6">
          <div className="mx-auto max-w-[1440px] px-4 text-center md:px-10">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#464555]">
              {t("socialProof.title")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-8 opacity-90 transition-all hover:opacity-100 md:gap-14">
              {logos.map((brand) => (
                <div key={brand.name} className="flex items-center gap-2">
                  <BrandLogo name={brand.name} />
                  <span className="text-[18px] font-bold tracking-tight text-[#0f172a]">
                    {brand.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 3. Omnichannel ──────────────────────────────────── */}
        <section id="canais" className="mx-auto max-w-[1440px] px-4 py-12 md:px-10">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <div className="mb-5 flex flex-col items-center gap-1.5">
              <span className="flex items-center gap-2">
                <BrandLogo name="Meta" className="h-7 w-7" />
                <span className="text-[22px] font-bold tracking-tight text-[#0f172a]">Meta</span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#64748b]">
                {t("channels.partnerLabel")}
              </span>
            </div>
            <h2 className="text-[32px] font-semibold leading-[40px] tracking-[-0.01em] text-[#0f172a]">
              {t("channels.heading")}
            </h2>
            <p className="mt-2 text-[16px] leading-[24px] text-[#464555]">{t("channels.sub")}</p>
          </div>

          <ChannelShowcase items={channels} hireHref={HIRE} />
        </section>

        {/* ── 4. AI Workforce / multi-agent ───────────────────── */}
        <section id="workforce" className="w-full bg-[#f5f2ff] py-12">
          <div className="mx-auto max-w-[1440px] px-4 md:px-10">
            <div className="mx-auto mb-6 max-w-3xl text-center">
              <span className="rounded-full bg-[#e2dfff] px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-[#0f0069]">
                {t("workforce.badge")}
              </span>
              <h2 className="mt-1 text-[32px] font-semibold leading-[40px] tracking-[-0.01em] text-[#0f172a]">
                {t("workforce.heading")}
              </h2>
              <p className="mt-2 text-[16px] leading-[24px] text-[#464555]">{t("workforce.sub")}</p>
            </div>

            <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
              {agents.map((agent, i) => {
                const s = AGENT_STYLES[i];
                return (
                  <div
                    key={agent.name}
                    className="flex flex-col justify-between rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(79,70,229,0.04)]"
                  >
                    <div>
                      <div className="mb-3 flex items-center gap-4">
                        <Image
                          src={s.img}
                          alt={agent.name}
                          className="h-24 w-24 shrink-0 rounded-xl object-cover object-center shadow-sm"
                        />
                        <div className="text-left">
                          <div className="flex items-center gap-1">
                            <h4 className="text-[24px] font-semibold text-[#0f172a]">{agent.name}</h4>
                            <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
                          </div>
                          <p className={`text-[14px] font-semibold ${s.role}`}>{agent.role}</p>
                          <span className="text-[12px] font-semibold text-[#64748b]">{agent.sub}</span>
                        </div>
                      </div>
                      <p className="text-left text-[16px] leading-[24px] text-[#464555]">{agent.desc}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between pt-3">
                      <span className="text-[12px] font-semibold text-[#464555]">
                        {agent.statLabel}{" "}
                        <strong className="text-[#0f172a]">{agent.statValue}</strong>
                      </span>
                      <Link
                        href={HIRE}
                        className={`rounded-lg bg-[#eae6f4] px-3 py-1.5 text-[12px] font-semibold transition-all ${s.btn}`}
                      >
                        {t("workforce.viewProfile")}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-xl bg-white p-3 shadow-[0_4px_24px_rgba(0,0,0,0.02)] md:p-6">
              <div className="flex flex-col items-center justify-between gap-3 text-left md:flex-row">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3525cd]/10 text-[#3525cd]">
                    <M name="account_tree" size={24} />
                  </div>
                  <div>
                    <p className="text-[14px] font-bold text-[#0f172a]">{t("workforce.handoffTitle")}</p>
                    <p className="text-[16px] leading-[24px] text-[#464555]">
                      {t("workforce.handoffDesc")}
                    </p>
                  </div>
                </div>
                <Link
                  href={SALES}
                  className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#3525cd] hover:underline"
                >
                  {t("workforce.handoffCta")}
                  <M name="east" size={18} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── 5. No-code RAG training ─────────────────────────── */}
        <section className="mx-auto max-w-[1440px] px-4 py-12 md:px-10">
          <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
            <div className="flex flex-col text-left lg:col-span-6">
              <span className="text-[12px] font-bold uppercase tracking-widest text-[#3525cd]">
                {t("rag.eyebrow")}
              </span>
              <h2 className="mt-1 text-[32px] font-semibold leading-[40px] tracking-[-0.01em] text-[#0f172a]">
                {t("rag.heading")}
              </h2>
              <p className="mt-1 text-[16px] leading-[24px] text-[#464555]">{t("rag.sub")}</p>

              <div className="mt-6 flex flex-col gap-3">
                {steps.map((step, i) => (
                  <div key={step.title} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3525cd] text-[14px] font-bold text-white">
                      {i + 1}
                    </div>
                    <div>
                      <h4 className="text-[14px] font-bold text-[#0f172a]">{step.title}</h4>
                      <p className="text-[16px] leading-[24px] text-[#464555]">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-white p-6 shadow-[0_12px_40px_rgba(79,70,229,0.06)] lg:col-span-6">
              <div className="mb-3 flex items-center justify-between pb-3">
                <span className="text-[14px] font-semibold text-[#0f172a]">{t("rag.cardTitle")}</span>
                <span className="rounded bg-[#10b981]/10 px-2 py-0.5 text-[12px] font-semibold text-[#10b981]">
                  {t("rag.cardBadge")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                {sources.map((src, i) => (
                  <div
                    key={src.title}
                    className="flex flex-col items-center rounded-lg bg-[#f5f2ff] p-3 text-center"
                  >
                    <M name={SOURCE_ICONS[i].icon} size={28} className={SOURCE_ICONS[i].color} />
                    <span className="mt-1 text-[12px] font-bold text-[#0f172a]">{src.title}</span>
                    <span className="text-[10px] text-[#64748b]">{src.sub}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 overflow-hidden rounded-lg shadow-sm">
                <Image
                  src={analyticsImg}
                  alt={t("rag.imageAlt")}
                  className="max-h-[190px] w-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. Pricing ──────────────────────────────────────── */}
        <section id="planos" className="w-full bg-[#f5f2ff] py-12">
          <div className="mx-auto max-w-[1440px] px-4 md:px-10">
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <span className="text-[12px] font-bold uppercase tracking-widest text-[#3525cd]">
                {t("pricing.eyebrow")}
              </span>
              <h2 className="mt-1 text-[32px] font-semibold leading-[40px] tracking-[-0.01em] text-[#0f172a]">
                {t("pricing.heading")}
              </h2>
              <p className="mt-2 text-[16px] leading-[24px] text-[#464555]">{t("pricing.sub")}</p>
            </div>

            <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-3">
              {plans.map((plan, i) => {
                const featured = i === 1;
                return (
                  <div
                    key={plan.name}
                    className={`relative flex flex-col justify-between rounded-xl bg-white p-6 ${
                      featured
                        ? "shadow-[0_12px_40px_rgba(53,37,205,0.12)] ring-2 ring-[#3525cd]"
                        : "shadow-[0_4px_24px_rgba(79,70,229,0.04)]"
                    }`}
                  >
                    {featured && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#3525cd] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm">
                        {t("pricing.featuredBadge")}
                      </div>
                    )}
                    <div>
                      <span
                        className={`text-[12px] font-bold uppercase tracking-wider ${
                          featured ? "text-[#3525cd]" : "text-[#64748b]"
                        }`}
                      >
                        {plan.tier}
                      </span>
                      <h3 className="mt-1 text-[24px] font-semibold leading-[32px] text-[#0f172a]">
                        {plan.name}
                      </h3>
                      <p className="mt-1 text-[14px] leading-[20px] text-[#464555]">{plan.desc}</p>
                      <div className="my-6">
                        <div className="flex items-baseline gap-1">
                          <span
                            className={`font-extrabold text-[#0f172a] ${
                              featured ? "text-[48px] leading-[56px] tracking-[-0.02em]" : "text-[24px] leading-[32px]"
                            }`}
                          >
                            {plan.price}
                          </span>
                          {plan.priceSuffix && (
                            <span className="text-[16px] text-[#464555]">{plan.priceSuffix}</span>
                          )}
                        </div>
                        <span
                          className={`text-[11px] ${
                            featured ? "font-semibold text-[#3525cd]" : "text-[#64748b]"
                          }`}
                        >
                          {plan.priceNote}
                        </span>
                      </div>
                      <ul className="flex flex-col gap-2.5 text-left text-[14px] text-[#464555]">
                        {plan.features.map((f, fi) => (
                          <li
                            key={f}
                            className={`flex items-center gap-2 ${
                              featured && fi === 0 ? "font-semibold text-[#0f172a]" : ""
                            }`}
                          >
                            <M
                              name={featured && fi === 0 ? "verified" : "check_circle"}
                              size={18}
                              className={featured && fi === 0 ? "text-[#3525cd]" : "text-[#10b981]"}
                            />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-12">
                      <Link
                        href={i === 2 ? SALES : HIRE}
                        className={`inline-flex w-full items-center justify-center rounded-lg py-3 text-[14px] font-semibold transition-all ${
                          featured
                            ? "bg-[#3525cd] text-white shadow-[0_8px_24px_rgba(53,37,205,0.25)] hover:bg-[#4f46e5]"
                            : i === 2
                              ? "bg-[#0f172a] text-white hover:bg-[#3525cd]"
                              : "bg-[#eae6f4] text-[#0f172a] hover:bg-[#0f172a] hover:text-white"
                        }`}
                      >
                        {plan.cta}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── 7. Proven impact stats ─────────────────────────── */}
        <section className="mx-auto max-w-[1440px] px-4 py-12 md:px-10">
          <div className="rounded-xl bg-gradient-to-br from-[#0f172a] to-[#302f39] p-6 text-white shadow-xl md:p-12">
            <div className="grid grid-cols-1 gap-6 text-center md:grid-cols-3 md:text-left">
              {stats.map((stat, i) => (
                <div key={stat.title} className="flex flex-col gap-2">
                  <span
                    className={`text-[48px] font-extrabold leading-none tracking-[-0.02em] ${IMPACT_ACCENT[i]}`}
                  >
                    {stat.value}
                  </span>
                  <p className="text-[24px] font-bold leading-[32px] text-white">{stat.title}</p>
                  <p className="text-[14px] leading-[20px] text-[#dad7ff]">{stat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 8. FAQ ─────────────────────────────────────────── */}
        <section id="faq" className="mx-auto max-w-[1440px] px-4 py-12 md:px-10">
          <div className="mx-auto mb-6 max-w-3xl text-center">
            <span className="text-[12px] font-bold uppercase tracking-widest text-[#3525cd]">
              {t("faq.eyebrow")}
            </span>
            <h2 className="mt-1 text-[32px] font-semibold leading-[40px] tracking-[-0.01em] text-[#0f172a]">
              {t("faq.heading")}
            </h2>
          </div>
          <div className="mx-auto flex max-w-3xl flex-col gap-1">
            {faqs.map((item) => (
              <details
                key={item.q}
                name="landing-faq"
                className="group cursor-pointer rounded-lg bg-white p-3 shadow-sm"
              >
                <summary className="flex list-none items-center justify-between text-[17px] font-semibold text-[#0f172a]">
                  <span>{item.q}</span>
                  <M
                    name="expand_more"
                    className="text-[#3525cd] transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="mt-1 text-left text-[16px] leading-relaxed text-[#464555]">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── 9. Final CTA ───────────────────────────────────── */}
        <section className="mx-auto max-w-[1440px] px-4 py-12 md:px-10">
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#3525cd] via-[#4f46e5] to-[#006591] p-6 text-center text-white shadow-[0_20px_50px_rgba(53,37,205,0.25)] md:p-12">
            <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-[#39b8fd]/20 blur-2xl" />
            <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center">
              <span className="mb-1 rounded-full bg-white/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-widest text-[#e2dfff] backdrop-blur-md">
                {t("finalCta.eyebrow")}
              </span>
              <h2 className="text-[32px] font-bold leading-[40px] tracking-[-0.01em] text-white">
                {t("finalCta.heading")}
              </h2>
              <p className="mt-2 max-w-xl text-[16px] leading-[24px] text-[#dad7ff]">
                {t("finalCta.sub")}
              </p>
              <div className="mt-6 flex w-full flex-wrap items-center justify-center gap-3">
                <Link
                  href={HIRE}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3.5 text-[14px] font-semibold text-[#3525cd] shadow-lg transition-all hover:scale-[1.02] hover:bg-[#f5f2ff]"
                >
                  <M name="rocket_launch" size={20} />
                  {t("finalCta.ctaPrimary")}
                </Link>
              </div>
              <span className="mt-3 text-[12px] font-semibold text-[#e2dfff]">{t("finalCta.fine")}</span>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="w-full bg-white pb-12 pt-12 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-[1440px] px-4 md:px-10">
          <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col items-start gap-3 lg:col-span-2">
              <Image src={logo} alt="Staffra" className="h-8 w-auto self-start object-contain" />
              <p className="max-w-sm text-[16px] leading-[24px] text-[#464555]">{t("footer.blurb")}</p>
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
            {footerCols.map((col) => (
              <div key={col.title} className="flex flex-col gap-1">
                <span className="mb-2 text-[14px] font-semibold uppercase tracking-wider text-[#1b1b24]">
                  {col.title}
                </span>
                {col.links.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="text-[16px] leading-[24px] text-[#464555] transition-colors hover:text-[#1b1b24]"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center justify-between gap-2 pt-6 text-[12px] font-semibold tracking-[0.02em] text-[#464555] md:flex-row">
            <p>{t("footer.rights")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
