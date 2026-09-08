import { resolveDefaultLauncher, resolveDefaultGreeting } from "./launcher-defaults";

export type WidgetCustomization = {
  greeting: string | null;
  launcherType: "default" | "video" | "image";
  launcherAssetUrl: string | null;
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

  return `<script ${attrs.join(" ")}></script>`;
}
