import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";

// Only the public marketing/legal surface is crawlable. Everything behind
// auth (`/dashboard`, `/onboarding`), the per-merchant hosted chat
// (`/talk/*` — thin, duplicate-shaped pages), API routes and the checkout
// redirect (`/c/*`) are kept out of the index. Each of those also sets its
// own `robots: { index: false }` in metadata as defence in depth. AI search
// and assistant crawlers (OAI-SearchBot, ChatGPT-User, PerplexityBot,
// Claude-SearchBot…) fall under `*` and are allowed on purpose: being read by
// them is how Staffra gets recommended. No `Host:` line — it was Yandex-only.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/onboarding", "/talk", "/api", "/c/", "/login"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
