import { describe, expect, it } from "vitest";
import { buildEmbedSnippet } from "@/lib/widget/embed-snippet";

const BASE_URL = "https://app.example.com";

describe("buildEmbedSnippet", () => {
  it("builds the plain snippet when nothing is customized", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "default",
      launcherAssetUrl: null,
    });

    expect(snippet).toBe(
      `<script src="${BASE_URL}/widget.js" data-company="acme" data-agent="malu"></script>`,
    );
  });

  it("adds data-greeting when a greeting is set", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: "Need help finding a gift?",
      launcherType: "default",
      launcherAssetUrl: null,
    });

    expect(snippet).toContain(`data-greeting="Need help finding a gift?"`);
  });

  it("adds data-launcher-type and data-launcher-src for a custom video", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "video",
      launcherAssetUrl: "https://cdn.example.com/launcher.webm",
    });

    expect(snippet).toContain(`data-launcher-type="video"`);
    expect(snippet).toContain(`data-launcher-src="https://cdn.example.com/launcher.webm"`);
  });

  it("adds data-launcher-type and data-launcher-src for a custom image", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "image",
      launcherAssetUrl: "https://cdn.example.com/launcher.png",
    });

    expect(snippet).toContain(`data-launcher-type="image"`);
  });

  it("emits data-launcher-type=mascot with no src -- it's a bundled asset, not an upload", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "mascot",
      launcherAssetUrl: null,
    });

    expect(snippet).toContain(`data-launcher-type="mascot"`);
    expect(snippet).not.toContain("data-launcher-src");
  });

  it("still carries the greeting alongside the mascot launcher (used if the merchant switches back)", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: "Precisa de ajuda?",
      launcherType: "mascot",
      launcherAssetUrl: null,
    });

    expect(snippet).toContain(`data-greeting="Precisa de ajuda?"`);
    expect(snippet).toContain(`data-launcher-type="mascot"`);
  });

  it("omits launcher attributes when the type is custom but no asset was ever saved", () => {
    // Defensive: shouldn't happen given the API route's own validation, but
    // the snippet builder should never emit a launcher-type with no src.
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: null,
      launcherType: "video",
      launcherAssetUrl: null,
    });

    expect(snippet).not.toContain("data-launcher-type");
    expect(snippet).not.toContain("data-launcher-src");
  });

  it("HTML-escapes a greeting containing quotes and angle brackets", () => {
    const snippet = buildEmbedSnippet(BASE_URL, "acme", "malu", {
      greeting: `Say "hi" <there> & smile`,
      launcherType: "default",
      launcherAssetUrl: null,
    });

    expect(snippet).toContain(`data-greeting="Say &quot;hi&quot; &lt;there&gt; &amp; smile"`);
    // Never a literal, unescaped closing tag inside the attribute value --
    // the exact class of bug that broke next-intl's rich-text parser
    // elsewhere in this app when a raw </body> landed in a message string.
    expect(snippet).not.toContain('"there>');
  });
});
