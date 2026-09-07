import type { MetadataRoute } from "next";
import { SITE_URL, absoluteUrl } from "@/lib/seo/site";

// Only the public marketing/legal surface is crawlable. Everything behind
// auth (`/dashboard`, `/onboarding`), the per-merchant hosted chat
// (`/talk/*` — thin, duplicate-shaped pages), API routes and the checkout
// redirect (`/c/*`) are kept out of the index. Each of those also sets its
// own `robots: { index: false }` in metadata as defence in depth.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/onboarding", "/talk", "/api", "/c/", "/login"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
