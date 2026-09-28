import { describe, expect, it } from "vitest";
import { buildEmbedSnippet } from "@/lib/widget/embed-snippet";

const BASE_URL = "https://app.example.com";

describe("buildEmbedSnippet", () => {
  it("builds the plain snippet when nothing is customized, baking in the default greeting and classic video", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "default",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
    });

    expect(snippet).toBe(
      `<script src="${BASE_URL}/widget.js" defer data-company="acme" data-agent="malu" data-greeting="Oi! 👋 Posso ajudar a encontrar o que você procura?" data-launcher-src="${BASE_URL}/agents/sales-1-launcher.webm"></script>`,
    );
  });

  it("uses this agent's own predefined default greeting when none is set", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "ana", {
      greeting: null,
      launcherType: "default",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
    });

    expect(snippet).toContain(`data-greeting="Agende seu horário aqui!"`);
  });

  it("falls back to a generic greeting for an agent with no predefined default", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "unknown-agent", {
      greeting: null,
      launcherType: "default",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
    });

    expect(snippet).toContain(`data-greeting="Posso ajudar?"`);
  });

  it("adds data-greeting when a greeting is set", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: "Need help finding a gift?",
      launcherType: "default",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
    });

    expect(snippet).toContain(`data-greeting="Need help finding a gift?"`);
  });

  it("sends the agent's curated profile photo as an absolute image launcher", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "photo",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
      photoType: "default_2",
      photoSrc: "/agents/sales-2.png",
    });

    expect(snippet).toContain(`data-launcher-type="image"`);
    expect(snippet).toContain(`data-launcher-src="${BASE_URL}/agents/sales-2.png"`);
  });

  it("keeps an uploaded profile photo's absolute URL as is", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "photo",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
      photoType: "custom",
      photoSrc: "https://cdn.example.com/agent-photos/me.png",
    });

    expect(snippet).toContain(`data-launcher-src="https://cdn.example.com/agent-photos/me.png"`);
  });

  it("falls back to the default video when the photo launcher has no photo", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "unknown-agent", {
      greeting: null,
      launcherType: "photo",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
      photoSrc: null,
    });

    expect(snippet).not.toContain("data-launcher-type");
    expect(snippet).toContain(`data-launcher-src="${BASE_URL}/widget-launcher.webm"`);
  });

  it("adds data-launcher-type and data-launcher-src for a custom image", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "image",
      launcherAssetUrl: "https://cdn.example.com/launcher.png",
      position: "bottom-right",
      offsetBottom: 0,
    });

    expect(snippet).toContain(`data-launcher-type="image"`);
  });

  it("falls back to the default video when the type is custom image but no asset was ever saved", () => {
    // Defensive: shouldn't happen given the API route's own validation, but
    // the snippet builder should never emit a launcher-type with no src --
    // it falls through to the default branch instead.
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "image",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
    });

    expect(snippet).not.toContain("data-launcher-type");
    expect(snippet).toContain(`data-launcher-src="${BASE_URL}/agents/sales-1-launcher.webm"`);
  });

  it("HTML-escapes a greeting containing quotes and angle brackets", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: `Say "hi" <there> & smile`,
      launcherType: "default",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
    });

    expect(snippet).toContain(`data-greeting="Say &quot;hi&quot; &lt;there&gt; &amp; smile"`);
    // Never a literal, unescaped closing tag inside the attribute value --
    // the exact class of bug that broke next-intl's rich-text parser
    // elsewhere in this app when a raw </body> landed in a message string.
    expect(snippet).not.toContain('"there>');
  });

  it("bakes in the agent's own default classic video, absolute-prefixed with baseUrl", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "ana", {
      greeting: null,
      launcherType: "default",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
    });

    expect(snippet).toContain(`data-launcher-src="${BASE_URL}/agents/ana-classic-launcher.webm"`);
  });

  it.each([
    ["malu", "default_1", "/agents/sales-1-launcher.webm"],
    ["malu", "default_2", "/agents/sales-2-launcher.webm"],
    ["malu", "custom", "/agents/sales-1-launcher.webm"],
    ["malu", null, "/agents/sales-1-launcher.webm"],
    ["ana", "default_1", "/agents/ana-classic-launcher.webm"],
    ["ana", "default_2", "/agents/secretary-2-launcher.webm"],
    ["ana", "custom", "/agents/ana-classic-launcher.webm"],
  ])("picks %s's default video matching the %s profile photo", (agentSlug, photoType, expectedSrc) => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", agentSlug, {
      greeting: null,
      launcherType: "default",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
      photoType,
    });

    expect(snippet).toContain(`data-launcher-src="${BASE_URL}${expectedSrc}"`);
  });

  it("ignores the profile photo when a custom launcher is saved", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "image",
      launcherAssetUrl: "https://cdn.example.com/launcher.png",
      position: "bottom-right",
      offsetBottom: 0,
      photoType: "default_2",
    });

    expect(snippet).toContain(`data-launcher-src="https://cdn.example.com/launcher.png"`);
    expect(snippet).not.toContain("sales-2-launcher");
  });

  it("falls back to the legacy shared classic video for an agent with no dedicated default", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "unknown-agent", {
      greeting: null,
      launcherType: "default",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
    });

    expect(snippet).toContain(`data-launcher-src="${BASE_URL}/widget-launcher.webm"`);
  });

  it("omits data-position and data-offset-bottom at their defaults", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "default",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
    });

    expect(snippet).not.toContain("data-position");
    expect(snippet).not.toContain("data-offset-bottom");
  });

  it("adds data-position when set to bottom-left", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "default",
      launcherAssetUrl: null,
      position: "bottom-left",
      offsetBottom: 0,
    });

    expect(snippet).toContain(`data-position="bottom-left"`);
  });

  it("adds data-offset-bottom when greater than zero", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "default",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 80,
    });

    expect(snippet).toContain(`data-offset-bottom="80"`);
  });
});
