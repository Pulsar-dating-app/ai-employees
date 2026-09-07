import type { MetadataRoute } from "next";

// Web App Manifest, served at /manifest.webmanifest. Static — not localised
// (it's a build-time asset); the copy mirrors the default (EN) metadata.
// Favicon (src/app/icon.png) and the apple-touch-icon (src/app/apple-icon.png)
// are wired by their own file conventions, so only the install icon lives here.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Staffra",
    short_name: "Staffra",
    description: "Hire AI employees that sell, support and book 24/7 across WhatsApp, Instagram and your website.",
    start_url: "/",
    display: "standalone",
    background_color: "#fcf8ff",
    theme_color: "#3525cd",
    icons: [
      { src: "/logo-icon.png", sizes: "578x578", type: "image/png", purpose: "any" },
    ],
  };
}
