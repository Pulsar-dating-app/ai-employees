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
      `<script src="${BASE_URL}/widget.js" data-company="acme" data-agent="malu" data-greeting="Oi! 👋 Posso ajudar a encontrar o que você procura?" data-launcher-src="${BASE_URL}/widget-launcher.webm"></script>`,
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

    expect(snippet).toContain(`data-greeting="Oi! 😊 Precisa marcar ou reagendar um horário? Posso te ajudar!"`);
  });

  it("falls back to a generic greeting for an agent with no predefined default", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "unknown-agent", {
      greeting: null,
      launcherType: "default",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
    });

    expect(snippet).toContain(`data-greeting="Oi! 👋 Posso te ajudar?"`);
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

  it("adds data-launcher-type and data-launcher-src for a custom video", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "video",
      launcherAssetUrl: "https://cdn.example.com/launcher.webm",
      position: "bottom-right",
      offsetBottom: 0,
    });

    expect(snippet).toContain(`data-launcher-type="video"`);
    expect(snippet).toContain(`data-launcher-src="https://cdn.example.com/launcher.webm"`);
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

  it("falls back to the classic default video when the type is custom but no asset was ever saved", () => {
    // Defensive: shouldn't happen given the API route's own validation, but
    // the snippet builder should never emit a launcher-type with no src --
    // it falls through to the default branch instead.
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "video",
      launcherAssetUrl: null,
      position: "bottom-right",
      offsetBottom: 0,
    });

    expect(snippet).not.toContain("data-launcher-type");
    expect(snippet).toContain(`data-launcher-src="${BASE_URL}/widget-launcher.webm"`);
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

  it("falls back to the legacy shared classic video for an agent with no dedicated default", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
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
