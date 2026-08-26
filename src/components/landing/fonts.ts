import { Archivo } from "next/font/google";

// Display only. Body and every authored product panel deliberately use
// Geist — the dashboard's own face, already loaded by the root layout as
// --font-geist-sans — so the product surfaces on this page read as the real
// application rather than an illustration of it, at zero extra font cost.
export const landingDisplay = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-landing-display",
});
