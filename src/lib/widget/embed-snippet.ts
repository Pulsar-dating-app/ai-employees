import { resolveDefaultLauncher, resolveDefaultGreeting } from "./launcher-defaults";

export type WidgetPosition = "bottom-right" | "bottom-left";

export type WidgetCustomization = {
  greeting: string | null;
  launcherType: "default" | "video" | "image";
  launcherAssetUrl: string | null;
  // Which bottom corner, and how far to lift it off the bottom edge -- for
  // a merchant whose own site has something (a mobile bottom nav bar, a
  // cookie banner) sitting where the launcher would otherwise land.
  position: WidgetPosition;
  offsetBottom: number;
};

// HTML-attribute escaping -- greeting and (in principle) a filename-derived
// asset URL are user-supplied text landing inside a double-quoted attribute
// in a <script> tag a merchant copies onto their own site. `&` first, so it
// doesn't double-escape the entities this introduces.
function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Shared by the server-rendered snippet on the agent's Connections page and
// the client-side "here's what you'll get" preview on the Customize card --
// both build the exact same string from the exact same inputs, so the copied
// snippet and the live preview of it can never drift apart.
export function buildEmbedSnippet(
  baseUrl: string,
  companySlug: string,
  agentSlug: string,
  customization: WidgetCustomization,
): string {
  const attrs = [
    `src="${baseUrl}/widget.js"`,
    // Keeps this third-party script out of the merchant's critical
    // rendering path, the same reason Staffra's own landing page loads it
    // via next/script's `lazyOnload` -- but `defer`, not `async`: widget.js
    // unconditionally does `document.body.appendChild(...)` with no
    // readiness check, so it needs the guarantee `defer` gives (runs only
    // after the document is fully parsed, so <body> definitely exists) even
    // when a merchant pastes this snippet in <head>. `async` can't promise
    // that -- it may run as soon as the file is fetched, which could be
    // before <body> exists.
    "defer",
    `data-company="${escapeAttr(companySlug)}"`,
    `data-agent="${escapeAttr(agentSlug)}"`,
  ];

  // Always emitted, never omitted -- a merchant's own text if they set one,
  // otherwise this agent's predefined default (see
  // launcher-defaults.ts's resolveDefaultGreeting). widget.js's own internal
  // fallback text only ever fires for a snippet generated before this
  // existed (no data-greeting attribute at all), which this always-emit
  // behavior can never produce going forward.
  const greetingText = customization.greeting || resolveDefaultGreeting(agentSlug);
  attrs.push(`data-greeting="${escapeAttr(greetingText)}"`);

  if (customization.launcherType !== "default" && customization.launcherAssetUrl) {
    attrs.push(`data-launcher-type="${customization.launcherType}"`);
    attrs.push(`data-launcher-src="${escapeAttr(customization.launcherAssetUrl)}"`);
  } else {
    // Default -- bakes in this agent's own default video (falls back to the
    // original shared one for a slug without a dedicated asset), so every
    // agent's bubble shows their own character rather than whichever one
    // first shipped. A snippet generated before this existed has no
    // data-launcher-src at all, and widget.js's own fallback to that same
    // shared file keeps it working unmodified -- this branch only changes
    // what *newly generated* snippets contain. Prefixed with baseUrl (not
    // left relative): this attribute is read by widget.js running on the
    // *merchant's* page, where a relative path would resolve against their
    // domain, not Staffra's.
    const asset = resolveDefaultLauncher(agentSlug);
    attrs.push(`data-launcher-src="${escapeAttr(baseUrl + asset.src)}"`);
  }

  // Omitted at their defaults -- most merchants never touch this, so most
  // snippets stay exactly as short as before. widget.js's own fallback
  // (bottom-right, 0) is identical to these defaults, so a pre-existing
  // snippet with neither attribute renders unchanged.
  if (customization.position === "bottom-left") {
    attrs.push(`data-position="bottom-left"`);
  }
  if (customization.offsetBottom > 0) {
    attrs.push(`data-offset-bottom="${customization.offsetBottom}"`);
  }

  return `<script ${attrs.join(" ")}></script>`;
}
