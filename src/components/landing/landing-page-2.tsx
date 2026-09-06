import Link from "next/link";
import Image from "next/image";
import { getTranslations, getLocale } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { landingV2Sans } from "./fonts";
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

// Real brand marks for the "technologies we use" strip (Material Symbols
// generic glyphs read as clip-art here). Each is the vendor's own logo path;
// shown at a small size beside the wordmark to signal the integration, not
// to imply endorsement.
function BrandLogo({ name }: { name: string }) {
  const common = "h-6 w-6 shrink-0";
  switch (name) {
    case "Google":
      return (
        <svg viewBox="0 0 48 48" className={common} aria-hidden="true">
          <path
            fill="#FFC107"
            d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
          />
          <path
            fill="#FF3D00"
            d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
          />
          <path
            fill="#4CAF50"
            d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
          />
          <path
            fill="#1976D2"
            d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
          />
        </svg>
      );
    case "WhatsApp":
      return (
        <svg viewBox="0 0 448 512" className={common} fill="#25D366" aria-hidden="true">
          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.2-157zM223.9 438.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.5-186.6 184.5zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
        </svg>
      );
    case "Telegram":
      return (
        <svg viewBox="0 0 496 512" className={common} fill="#29A9EB" aria-hidden="true">
          <path d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm121.8 169.9l-40.7 191.8c-3 13.6-11.1 16.9-22.4 10.5l-62-45.7-29.9 28.8c-3.3 3.3-6.1 6.1-12.5 6.1l4.4-63.1 114.9-103.8c5-4.4-1.1-6.9-7.7-2.5l-142 89.4-61.2-19.1c-13.3-4.2-13.6-13.3 2.8-19.7l239.1-92.2c11.1-4 20.8 2.7 17.2 19.1z" />
        </svg>
      );
    case "Instagram":
      return (
        <svg viewBox="0 0 448 512" className={common} aria-hidden="true">
          <defs>
            <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F58529" />
              <stop offset="30%" stopColor="#DD2A7B" />
              <stop offset="60%" stopColor="#8134AF" />
              <stop offset="100%" stopColor="#515BD4" />
            </linearGradient>
          </defs>
          <path
            fill="url(#ig-grad)"
            d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"
          />
        </svg>
      );
    case "Meta":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="#0467DF" aria-hidden="true">
          <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.324l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.09-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.708 0-1.064-.4-1.064-1.517 0-2.567 1.213-5.564 3.038-7.523.632-.68 1.396-1.29 2.297-1.489z" />
        </svg>
      );
    case "OpenAI":
      return (
        <svg viewBox="0 0 24 24" className={common} fill="#000" aria-hidden="true">
          <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3733v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 7.1937V4.8614a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
        </svg>
      );
    default:
      return null;
  }
}
type ChannelCard = { tag: string; title: string; desc: string; bullets: string[] };
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
type FooterCol = { title: string; links: string[] };

// Per-card visual styling kept in code (icons + accent colours), matched to
// the Stitch markup by index.
const CHANNEL_STYLES = [
  { icon: "chat", box: "bg-[#10b981]/10 text-[#10b981]", tag: "text-[#10b981]" },
  { icon: "photo_camera", box: "bg-[#e2dfff] text-[#3525cd]", tag: "text-[#3525cd]" },
  { icon: "web", box: "bg-[#c9e6ff] text-[#006591]", tag: "text-[#006591]" },
  { icon: "calendar_today", box: "bg-[#ffdbcc] text-[#7e3000]", tag: "text-[#7e3000]" },
] as const;

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
  const channels = t.raw("channels.cards") as ChannelCard[];
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
                            <M name="picture_as_pdf" size={20} className="text-[#3525cd]" />
                            <span className="truncate text-[12px] font-semibold text-[#0f172a]">
                              {t("hero.chat.fileName")}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#64748b]">2.1 MB</span>
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
          <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div className="max-w-2xl text-left">
              <span className="text-[12px] font-semibold uppercase tracking-widest text-[#3525cd]">
                {t("channels.eyebrow")}
              </span>
              <h2 className="mt-1 text-[32px] font-semibold leading-[40px] tracking-[-0.01em] text-[#0f172a]">
                {t("channels.heading")}
              </h2>
              <p className="mt-2 text-[16px] leading-[24px] text-[#464555]">{t("channels.sub")}</p>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-lg bg-[#eae6f4] px-3 py-2 text-[14px] font-semibold text-[#1b1b24] md:self-auto">
              <M name="hub" size={18} className="text-[#10b981]" />
              {t("channels.badge")}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {channels.map((card, i) => {
              const s = CHANNEL_STYLES[i];
              return (
                <div
                  key={card.title}
                  className="flex flex-col justify-between rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(79,70,229,0.04)] transition-all hover:shadow-[0_8px_30px_rgba(79,70,229,0.08)]"
                >
                  <div>
                    <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-lg ${s.box}`}>
                      <M name={s.icon} size={28} />
                    </div>
                    <span className={`text-[12px] font-bold uppercase ${s.tag}`}>{card.tag}</span>
                    <h3 className="mt-1 text-[24px] font-semibold leading-[32px] text-[#0f172a]">
                      {card.title}
                    </h3>
                    <p className="mt-2 text-[16px] leading-[24px] text-[#464555]">{card.desc}</p>
                  </div>
                  <ul className="mt-3 flex flex-col gap-1.5 pt-3 text-[12px] font-semibold text-[#464555]">
                    {card.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-2">
                        <M name="check" size={16} className="text-[#10b981]" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
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
                <Link
                  href={SALES}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 px-6 py-3.5 text-[14px] font-semibold text-white backdrop-blur-md transition-all hover:bg-white/20"
                >
                  {t("finalCta.ctaSecondary")}
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
            <div className="flex flex-col gap-3 lg:col-span-2">
              <Image src={logo} alt="Staffra" className="h-8 w-auto object-contain" />
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
                {col.links.map((label) => (
                  <a
                    key={label}
                    href="#"
                    className="text-[16px] leading-[24px] text-[#464555] transition-colors hover:text-[#1b1b24]"
                  >
                    {label}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center justify-between gap-2 pt-6 text-[12px] font-semibold tracking-[0.02em] text-[#464555] md:flex-row">
            <p>{t("footer.rights")}</p>
            <p>{t("footer.tagline")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
