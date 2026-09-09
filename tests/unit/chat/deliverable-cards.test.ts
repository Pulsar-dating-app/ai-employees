import { describe, expect, it } from "vitest";
import {
  channelRendersProductCards,
  formatProductPrice,
  toDeliverableCards,
  type ProductCard,
} from "@/lib/chat/product-cards";
import { buildInstagramProductElements } from "@/lib/instagram/meta-instagram-api";
import { buildTelegramProductCaption } from "@/lib/telegram/bot-api";

// A card leaves the database once and is then rendered three different
// ways: HTML rows on the web, a generic-template carousel on Instagram, a
// media-group album on Telegram. These pin the two payload builders and the
// one price formatter they all share, so the same product can't read
// differently depending on where the customer happens to be.

function card(overrides: Partial<ProductCard> = {}): ProductCard {
  return {
    id: "p1",
    name: "The Hidden Snowboard",
    description: "Prancha para neve profunda.",
    price: "749.95",
    currency: "USD",
    imageUrl: "https://cdn.example.com/hidden.jpg",
    url: "https://staffra.io/c/abc123",
    ...overrides,
  };
}

describe("channelRendersProductCards", () => {
  it.each(["web_chat", "instagram", "telegram"])("renders cards on %s", (channel) => {
    expect(channelRendersProductCards(channel)).toBe(true);
  });

  // WhatsApp's single-message product format needs a Meta Commerce
  // catalogue this app doesn't sync, so it stays text-only on purpose.
  it.each(["whatsapp", "", null, undefined, "WEB_CHAT"])("does not render cards on %s", (channel) => {
    expect(channelRendersProductCards(channel)).toBe(false);
  });
});

// Intl separates the currency symbol from the amount with a NON-BREAKING
// space (U+00A0), not a plain one. It reaches the customer verbatim inside a
// Telegram caption and an Instagram subtitle, so it is pinned explicitly
// rather than papered over with a normalising assertion.
const NBSP = "\u00a0";

describe("formatProductPrice", () => {
  it("formats in the product's own currency, not the reader's", () => {
    expect(formatProductPrice("749.95", "USD", "pt-BR")).toBe(`US$${NBSP}749,95`);
    expect(formatProductPrice("89.9", "BRL", "pt-BR")).toBe(`R$${NBSP}89,90`);
  });

  it("falls back to a plain number when the currency code is missing or junk", () => {
    expect(formatProductPrice("749.95", null, "pt-BR")).toBe("749,95");
    expect(formatProductPrice("749.95", "NOT_A_CURRENCY", "pt-BR")).toBe("749,95");
  });

  it("returns null when there is no usable price", () => {
    expect(formatProductPrice(null, "USD", "pt-BR")).toBeNull();
    expect(formatProductPrice("abc", "USD", "pt-BR")).toBeNull();
  });
});

describe("toDeliverableCards", () => {
  it("renders the price once, server-side, so no channel re-interprets it", () => {
    expect(toDeliverableCards([card()])).toEqual([
      {
        name: "The Hidden Snowboard",
        description: "Prancha para neve profunda.",
        priceLabel: `US$${NBSP}749,95`,
        imageUrl: "https://cdn.example.com/hidden.jpg",
        url: "https://staffra.io/c/abc123",
      },
    ]);
  });
});

describe("buildInstagramProductElements", () => {
  const deliverable = (overrides = {}) => ({ ...toDeliverableCards([card()])[0], ...overrides });

  it("maps a card onto a carousel element with a tappable default action", () => {
    expect(buildInstagramProductElements([deliverable()])).toEqual([
      {
        title: "The Hidden Snowboard",
        image_url: "https://cdn.example.com/hidden.jpg",
        subtitle: `US$${NBSP}749,95 · Prancha para neve profunda.`,
        default_action: { type: "web_url", url: "https://staffra.io/c/abc123" },
      },
    ]);
  });

  // Meta rejects the whole payload when a field is over length rather than
  // truncating it, so one long product name must not take the carousel down.
  it("clamps title and subtitle to Meta's limits", () => {
    const [element] = buildInstagramProductElements([
      deliverable({ name: "N".repeat(200), description: "D".repeat(200) }),
    ]);
    expect(element.title.length).toBeLessThanOrEqual(80);
    expect(element.subtitle!.length).toBeLessThanOrEqual(80);
    expect(element.title.endsWith("…")).toBe(true);
  });

  it("omits the subtitle entirely when there is no price and no description", () => {
    const [element] = buildInstagramProductElements([deliverable({ priceLabel: null, description: null })]);
    expect(element).not.toHaveProperty("subtitle");
  });

  it("omits the action when the product had no URL to link to", () => {
    const [element] = buildInstagramProductElements([deliverable({ url: null })]);
    expect(element).not.toHaveProperty("default_action");
  });

  // A carousel element without an image is an empty tile; Meta also fetches
  // the URL server-side, so there is nothing to show without one.
  it("drops a card with no image", () => {
    expect(buildInstagramProductElements([deliverable({ imageUrl: null })])).toEqual([]);
  });

  it("caps at the template's 10 elements", () => {
    const many = Array.from({ length: 15 }, () => deliverable());
    expect(buildInstagramProductElements(many)).toHaveLength(10);
  });
});

describe("buildTelegramProductCaption", () => {
  const deliverable = (overrides = {}) => ({ ...toDeliverableCards([card()])[0], ...overrides });

  it("puts name and price on the headline, then description, then the link", () => {
    expect(buildTelegramProductCaption(deliverable())).toBe(
      `<b>The Hidden Snowboard</b> — US$${NBSP}749,95\n` +
        "Prancha para neve profunda.\n" +
        '<a href="https://staffra.io/c/abc123">Ver produto</a>',
    );
  });

  // parse_mode HTML applies to the whole caption, so an unescaped & or <
  // in merchant data breaks the message or is read as markup. A product
  // genuinely called "Camiseta P&B" has to survive.
  it("escapes HTML in merchant-entered names", () => {
    const caption = buildTelegramProductCaption(deliverable({ name: "Camiseta P&B <novo>" }));
    expect(caption).toContain("Camiseta P&amp;B &lt;novo&gt;");
    expect(caption).not.toContain("<novo>");
  });

  it("drops the link line when the product had no URL", () => {
    expect(buildTelegramProductCaption(deliverable({ url: null }))).not.toContain("Ver produto");
  });

  it("keeps the headline alone when there is no price or description", () => {
    expect(buildTelegramProductCaption(deliverable({ priceLabel: null, description: null, url: null }))).toBe(
      "<b>The Hidden Snowboard</b>",
    );
  });
});
