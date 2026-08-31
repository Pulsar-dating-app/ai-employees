import { Inter } from "next/font/google";

// The public landing (`src/components/landing/landing-page-2.tsx`) is a
// faithful reproduction of the Stitch "Staffra Human-Centric AI" design
// system, which specifies Inter exclusively. Loaded here so the dashboard's
// Geist bundle stays untouched.
export const landingV2Sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-landing-v2",
});
