import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { SITE_URL, absoluteUrl } from "@/lib/seo/site";
import "./globals.css";

// Inter is the Staffra "Human-Centric AI" design-system typeface (Stitch).
// Geist Mono stays wired as --font-mono; no surface uses it yet.
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
    openGraph: {
      type: "website",
      url: absoluteUrl("/"),
      siteName,
      title,
      description,
      images: [{ url: "/logo.png", alt: t("ogImageAlt") }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/logo.png"],
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
