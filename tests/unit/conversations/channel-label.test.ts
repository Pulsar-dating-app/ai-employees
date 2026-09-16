import { describe, expect, it } from "vitest";
import { channelLabel } from "@/lib/conversations/channel-label";
import en from "../../../messages/en.json";
import pt from "../../../messages/pt.json";

const CHANNELS = ["whatsapp", "web_chat", "instagram", "telegram"] as const;

function translatorFor(messages: Record<string, string>) {
  const t = ((key: string) => {
    if (!(key in messages)) throw new Error(`missing key ${key}`);
    return messages[key];
  }) as ((key: string) => string) & { has: (key: string) => boolean };
  t.has = (key: string) => key in messages;
  return t;
}

describe("channelLabel", () => {
  it("translates every channel the conversation_channel enum can hold", () => {
    const listMessages = Object.fromEntries(
      Object.entries(en.Conversations.channel).map(([k, v]) => [`channel.${k}`, v]),
    );
    const t = translatorFor(listMessages);
    for (const channel of CHANNELS) {
      const label = channelLabel(t, channel);
      expect(label).not.toContain("channel.");
      expect(label.length).toBeGreaterThan(0);
    }
    expect(channelLabel(t, "whatsapp")).toBe("WhatsApp");
  });

  it("falls back to a readable slug instead of leaking the raw key path", () => {
    const t = translatorFor({});
    expect(channelLabel(t, "whatsapp")).toBe("Whatsapp");
    expect(channelLabel(t, "some_future_channel")).toBe("Some Future Channel");
  });

  it("falls back when the translator throws rather than reporting has()", () => {
    const throwing = ((key: string) => {
      throw new Error(`missing ${key}`);
    }) as (key: string) => string;
    expect(channelLabel(throwing, "telegram")).toBe("Telegram");
  });
});

// The regression itself: whatsapp and telegram shipped as channels months
// before anyone translated them, so the inbox rendered the literal string
// "Conversations.channel.whatsapp" to merchants.
describe("channel message coverage", () => {
  for (const [locale, messages] of Object.entries({ en, pt })) {
    it(`${locale} translates every channel in both the list and the detail view`, () => {
      for (const channel of CHANNELS) {
        expect(messages.Conversations.channel).toHaveProperty(channel);
        expect(messages.Conversations.detail.channel).toHaveProperty(channel);
      }
    });
  }
});
