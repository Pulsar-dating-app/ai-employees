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

  if (customization.greeting) {
    attrs.push(`data-greeting="${escapeAttr(customization.greeting)}"`);
  }

  if (customization.launcherType !== "default" && customization.launcherAssetUrl) {
    attrs.push(`data-launcher-type="${customization.launcherType}"`);
    attrs.push(`data-launcher-src="${escapeAttr(customization.launcherAssetUrl)}"`);
  }

  return `<script ${attrs.join(" ")}></script>`;
}
