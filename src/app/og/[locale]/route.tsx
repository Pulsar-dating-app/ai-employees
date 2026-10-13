import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import { OG_IMAGE_SIZE } from "@/lib/seo/social";

const PRIMARY = "#3525cd";
const INK = "#1b1b24";
const INK_SOFT = "#464555";
const SURFACE = "#fcf8ff";
const FIXED = "#e2dfff";

export const dynamicParams = false;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function GET(_request: Request, { params }: RouteContext<"/og/[locale]">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Seo" });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          backgroundColor: SURFACE,
          backgroundImage: `radial-gradient(circle at 85% 15%, ${FIXED} 0%, ${SURFACE} 55%)`,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 30,
            fontWeight: 600,
            color: PRIMARY,
            letterSpacing: "-0.01em",
          }}
        >
          {t("siteName")}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              color: INK,
              maxWidth: 980,
            }}
          >
            {t("ogHeadline")}
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 30,
              fontWeight: 400,
              color: INK_SOFT,
              maxWidth: 900,
            }}
          >
            {t("ogSubtitle")}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", fontSize: 24, color: INK_SOFT }}>
          <div style={{ width: 44, height: 6, backgroundColor: PRIMARY, borderRadius: 3, marginRight: 20 }} />
          www.staffra.io
        </div>
      </div>
    ),
    OG_IMAGE_SIZE,
  );
}
