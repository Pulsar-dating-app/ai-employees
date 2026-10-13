import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { SITE_URL } from "@/lib/seo/site";
import { socialMetadata } from "@/lib/seo/social";
import type { Locale } from "@/i18n/locales";
import "./globals.css";

// Inter is the Staffra "Human-Centric AI" design-system typeface (Stitch).
// Geist Mono backs --font-mono (globals.css) — used by the `font-mono`
// code blocks on the dashboard (embed snippet, copy fields). Not on the
// landing's critical path: the browser only fetches the file when a rendered
// element actually uses `font-mono`, and no landing surface does.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Async so the title/description track the request locale (EN/PT) the same
// way every other server-rendered string does. `metadataBase` makes every
// relative OG/canonical URL resolve against the canonical origin.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Seo");
  const locale = (await getLocale()) as Locale;
  const title = t("defaultTitle");
  const description = t("description");
  const siteName = t("siteName");

  // Search-engine ownership verification via the HTML-tag method. Set the
  // token env(s) to whatever Google Search Console / Bing Webmaster Tools
  // hand you; leaving them unset renders no tag. (The DNS-TXT method needs
  // nothing here and is preferable when you have registrar access — it
  // covers every subdomain and protocol at once.)
  const googleVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  const bingVerification = process.env.BING_SITE_VERIFICATION?.trim();
  const verification =
    googleVerification || bingVerification
      ? {
          ...(googleVerification ? { google: googleVerification } : {}),
          ...(bingVerification ? { other: { "msvalidate.01": bingVerification } } : {}),
        }
      : undefined;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s · ${siteName}`,
    },
    description,
    applicationName: siteName,
    ...(verification ? { verification } : {}),
    ...(await socialMetadata({ locale, path: "/", title, description })),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
