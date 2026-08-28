import { describe, expect, it } from "vitest";
import { isLinkPreviewAgent } from "@/lib/checkout/links";

// Trello E1. WhatsApp fetches every link in a message to build its preview
// card, before a human touches it -- so without this, every link Malu sends
// would immediately count as a click.
describe("isLinkPreviewAgent", () => {
  it("catches WhatsApp, the channel these links are actually sent over", () => {
    expect(isLinkPreviewAgent("WhatsApp/2.23.20.0")).toBe(true);
    expect(isLinkPreviewAgent("WhatsApp/2.2410.2 A")).toBe(true);
  });

  it("catches the other common preview crawlers", () => {
    for (const ua of [
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "TelegramBot (like TwitterBot)",
      "Twitterbot/1.0",
      "Slackbot-LinkExpanding 1.0",
      "Mozilla/5.0 (compatible; Discordbot/2.0)",
      "LinkedInBot/1.0",
      "Mozilla/5.0 (compatible; Googlebot/2.1)",
    ]) {
      expect(isLinkPreviewAgent(ua), ua).toBe(true);
    }
  });

  it("treats real mobile browsers as human clicks", () => {
    for (const ua of [
      // Where a real tap from WhatsApp actually lands: the phone's browser.
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    ]) {
      expect(isLinkPreviewAgent(ua), ua).toBe(false);
    }
  });

  it("counts an absent or empty user-agent as human rather than dropping the click", () => {
    // Erring toward counting: a real click misread as a bot silently loses a
    // data point, which is worse than one uncertain row.
    expect(isLinkPreviewAgent(null)).toBe(false);
    expect(isLinkPreviewAgent(undefined)).toBe(false);
    expect(isLinkPreviewAgent("")).toBe(false);
  });
});
