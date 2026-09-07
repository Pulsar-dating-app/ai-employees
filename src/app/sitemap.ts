import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";

// Static list of the public, indexable routes. `/sign-up` is intentionally
// absent — it only `redirect()`s to `/?auth=signup`. Per-merchant `/talk/*`
// pages are noindex and never listed here. Locale is cookie-based with no
// URL segment, so there is one entry per route (no hreflang alternates yet —
// tracked by the "URL por idioma" SEO card).
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/privacy"), lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: absoluteUrl("/terms"), lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
