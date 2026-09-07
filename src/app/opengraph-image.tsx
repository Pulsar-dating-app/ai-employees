import { ImageResponse } from "next/og";

// The share card shown when a link to the site is posted to WhatsApp,
// LinkedIn, X, Slack, etc. Generated (not a static file) so the copy stays
// in one place and a brand-colour tweak is a code change, not a re-export
// from a design tool. Statically optimised at build time — no request-time
// data is read here.
//
// Text-only on purpose: no font or image file is read, so there is nothing
// that can fail the build on a path or runtime difference. Palette matches
// the landing (src/components/landing/landing-page-2.tsx).

export const alt = "Staffra — AI employees that sell, support and book on WhatsApp, Instagram and your site";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PRIMARY = "#3525cd";
const INK = "#1b1b24";
const INK_SOFT = "#464555";
const SURFACE = "#fcf8ff";
const FIXED = "#e2dfff";

export default function OpengraphImage() {
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
          Staffra
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: INK,
              maxWidth: 900,
            }}
          >
            Hire AI employees that sell, support and book 24/7
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 30,
              fontWeight: 400,
              color: INK_SOFT,
              maxWidth: 860,
            }}
          >
            Trained on your documents and catalogue. Live on Official WhatsApp,
            Instagram, Telegram and your website in under 15 minutes.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", fontSize: 24, color: INK_SOFT }}>
          <div style={{ width: 44, height: 6, backgroundColor: PRIMARY, borderRadius: 3, marginRight: 20 }} />
          www.staffra.io
        </div>
      </div>
    ),
    size,
  );
}
