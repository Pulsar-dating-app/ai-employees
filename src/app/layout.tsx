import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { SITE_URL, absoluteUrl } from "@/lib/seo/site";
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
  const title = t("defaultTitle");
  const description = t("description");
  const siteName = t("siteName");

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s · ${siteName}`,
    },
    description,
    applicationName: siteName,
    // `images` is deliberately omitted — the app/opengraph-image.tsx and
    // app/twitter-image.tsx file conventions generate the card and inject the
    // tags (with width/height/type). Setting `images` here would override them.
    openGraph: {
      type: "website",
      url: absoluteUrl("/"),
      siteName,
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
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
