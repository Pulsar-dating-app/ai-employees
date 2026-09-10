import { describe, expect, it } from "vitest";
import {
  MAX_CARD_DESCRIPTION_LENGTH,
  MAX_PRODUCT_CARDS,
  collectSearchedProducts,
  readMessageMetadata,
  selectProductCards,
} from "@/lib/chat/product-cards";

// Which products end up as cards under a reply, and what each card carries.
// Since 2026-09-10 the prose decides: a product is carded only if the reply
// names it by its catalog name, and a reply that names none shows none.

function product(overrides: Record<string, unknown> & { id: string; name: string }) {
  return {
    description: null,
    price: 749.95,
    currency: "USD",
    image_url: `https://cdn.example.com/${overrides.id}.jpg`,
    product_url: `https://loja.example.com/${overrides.id}`,
    ...overrides,
  };
}

function searchCall(rows: unknown[]) {
  return { name: "search_products", args: {}, result: rows };
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("collectSearchedProducts", () => {
  it("ignores tool calls that are not product searches", () => {
    const calls = [
      { name: "get_business_information", args: {}, result: { hours: "9-18" } },
      searchCall([product({ id: "a", name: "The Hidden Snowboard" })]),
    ];
    expect(ids(collectSearchedProducts(calls))).toEqual(["a"]);
  });

  it("de-duplicates a product returned by two searches in the same turn", () => {
    const row = product({ id: "a", name: "The Hidden Snowboard" });
    const calls = [searchCall([row]), searchCall([row, product({ id: "b", name: "The Videographer Snowboard" })])];
    expect(ids(collectSearchedProducts(calls))).toEqual(["a", "b"]);
  });

  it("survives a malformed row without dropping its valid siblings", () => {
    const calls = [searchCall([null, { id: 7 }, { id: "a", name: "   " }, product({ id: "b", name: "Bota Trilha" })])];
    expect(ids(collectSearchedProducts(calls))).toEqual(["b"]);
  });

  // search_products is an RPC, and PostgREST returns a numeric column as a
  // JSON *number* there while a plain REST select returns it as a string.
  // Accepting only the string shape silently dropped every price from every
  // card (found in production, 2026-09-09).
  it("keeps a price whether the RPC returned a number or a string", () => {
    const calls = [
      searchCall([product({ id: "a", name: "Prancha A", price: 749.95 }), product({ id: "b", name: "Prancha B", price: "885.95" })]),
    ];
    const collected = collectSearchedProducts(calls);
    expect(collected.map((p) => p.price)).toEqual(["749.95", "885.95"]);
  });

  it("nulls a price that is neither a number nor a string", () => {
    const calls = [searchCall([product({ id: "a", name: "Prancha", price: null })])];
    expect(collectSearchedProducts(calls)[0].price).toBeNull();
  });

  it("truncates a long description on a word boundary with an ellipsis", () => {
    const long = "Uma prancha de snowboard feita para neve profunda e descidas longas, com base rápida, "
      + "flex médio e acabamento resistente para toda a temporada de inverno.";
    const calls = [searchCall([product({ id: "a", name: "Prancha", description: long })])];
    const { description } = collectSearchedProducts(calls)[0];

    expect(description!.length).toBeLessThanOrEqual(MAX_CARD_DESCRIPTION_LENGTH + 1);
    expect(description!.endsWith("…")).toBe(true);
    expect(description).not.toMatch(/\s…$/);
    expect(long.startsWith(description!.slice(0, -1))).toBe(true);
  });

  it("leaves a short description alone and collapses its whitespace", () => {
    const calls = [searchCall([product({ id: "a", name: "Prancha", description: "  Leve   e   rápida.\n" })])];
    expect(collectSearchedProducts(calls)[0].description).toBe("Leve e rápida.");
  });

  it("treats a blank description as no description", () => {
    const calls = [searchCall([product({ id: "a", name: "Prancha", description: "   " })])];
    expect(collectSearchedProducts(calls)[0].description).toBeNull();
  });
});

const rows = [
  product({ id: "hidden", name: "The Hidden Snowboard" }),
  product({ id: "videographer", name: "The Videographer Snowboard" }),
  product({ id: "fulfilled", name: "The 3p Fulfilled Snowboard" }),
  product({ id: "complete", name: "The Complete Snowboard" }),
  product({ id: "multi", name: "The Multi-location Snowboard" }),
];

// The primary path since 2026-09-10: the model's structured reply carries
// `product_ids`, and `selectProductCards` shows exactly those, in that
// order. `[]` means no cards. An id the turn never searched is ignored.
describe("selectProductCards with the model's explicit product_ids", () => {
  it("shows exactly the ids the model chose, in its order", () => {
    const selected = selectProductCards([searchCall(rows)], "Temos essas opções:", ["complete", "hidden"]);
    expect(ids(selected)).toEqual(["complete", "hidden"]);
  });

  it("shows nothing for an empty list, whatever the prose says", () => {
    const reply = "A The Complete Snowboard é uma opção, mas não recomendo para iniciantes.";
    expect(selectProductCards([searchCall(rows)], reply, [])).toEqual([]);
  });

  it("does not card a product the reply names but the model left out of product_ids", () => {
    // The exclude-by-contrast case: "not the blue one" mentions Liquid, but
    // its id isn't in the list, so it gets no card.
    const withLiquid = [
      product({ id: "complete", name: "The Complete Snowboard" }),
      product({ id: "liquid", name: "The Collection Snowboard: Liquid" }),
    ];
    const reply = "Recomendo a The Complete Snowboard. A The Collection Snowboard: Liquid é a azul, então não seria essa.";
    expect(ids(selectProductCards([searchCall(withLiquid)], reply, ["complete"]))).toEqual(["complete"]);
  });

  it("ignores an id that was never in this turn's search results", () => {
    const selected = selectProductCards([searchCall(rows)], "Temos:", ["complete", "not-a-real-id"]);
    expect(ids(selected)).toEqual(["complete"]);
  });

  it("de-duplicates a repeated id", () => {
    const selected = selectProductCards([searchCall(rows)], "Temos:", ["hidden", "hidden", "complete"]);
    expect(ids(selected)).toEqual(["hidden", "complete"]);
  });

  it("caps at MAX_PRODUCT_CARDS", () => {
    const selected = selectProductCards(
      [searchCall(rows)],
      "Temos:",
      ["hidden", "videographer", "fulfilled", "complete", "multi"],
    );
    expect(selected).toHaveLength(MAX_PRODUCT_CARDS);
    expect(ids(selected)).toEqual(["hidden", "videographer", "fulfilled", "complete"]);
  });

  it("returns [] when none of the chosen products has an image", () => {
    const imageless = [product({ id: "a", name: "Prancha Alpina", image_url: null })];
    expect(selectProductCards([searchCall(imageless)], "Temos a Prancha Alpina.", ["a"])).toEqual([]);
  });
});

// The legacy fallback, used only when `displayProductIds` is null/undefined
// (an older model, an error, an in-process fake): card the searched
// products the reply names by catalog name.
describe("selectProductCards fallback (no explicit product_ids)", () => {
  it("shows nothing when the reply names none of the searched products", () => {
    const selected = selectProductCards([searchCall(rows)], "Olá! 😊 Temos sim. Algumas opções de snowboard:");
    expect(selected).toEqual([]);
  });

  it("shows a card for each product the reply names, in the order it names them", () => {
    const selected = selectProductCards(
      [searchCall(rows)],
      "A The Videographer Snowboard está disponível, e a The Hidden Snowboard também.",
    );
    expect(ids(selected)).toEqual(["videographer", "hidden"]);
  });

  it("caps at MAX_PRODUCT_CARDS even when the reply names more", () => {
    const selected = selectProductCards(
      [searchCall(rows)],
      "Temos a The Hidden Snowboard, a The Videographer Snowboard, a The 3p Fulfilled Snowboard, " +
        "a The Complete Snowboard e a The Multi-location Snowboard.",
    );
    expect(selected).toHaveLength(MAX_PRODUCT_CARDS);
    expect(ids(selected)).toEqual(["hidden", "videographer", "fulfilled", "complete"]);
  });

  it("matches a named product across accents and casing", () => {
    const selected = selectProductCards(
      [searchCall([product({ id: "a", name: "Camiseta Básica Algodão" }), product({ id: "b", name: "Boné Liso" })])],
      "a camiseta basica algodao sai por R$ 59,90",
    );
    expect(ids(selected)).toEqual(["a"]);
  });

  it("attaches nothing when the turn searched for nothing", () => {
    expect(selectProductCards([{ name: "get_policy_information", result: {} }], "Trocas em 30 dias.")).toEqual([]);
  });

  it("attaches nothing when a search came back empty", () => {
    expect(selectProductCards([searchCall([])], "Não encontrei nada com esse nome.")).toEqual([]);
  });

  it("attaches nothing when the reply declines, even though the search found something", () => {
    const found = [product({ id: "a", name: "Óculos de Sol Retrô" })];
    const reply = "Não encontrei óculos próprios para neve 😕 Só temos um óculos de sol com proteção UV.";
    expect(selectProductCards([searchCall(found)], reply)).toEqual([]);
  });

  // The picture is the entire reason cards exist; without one they would
  // just restate the text.
  it("attaches nothing when the one named product has no image", () => {
    const imageless = [product({ id: "a", name: "Prancha Alpina", image_url: null })];
    expect(selectProductCards([searchCall(imageless)], "Temos a Prancha Alpina disponível.")).toEqual([]);
  });

  it("still attaches a named product with no image when a named sibling has one", () => {
    const mixed = [
      product({ id: "a", name: "Prancha Alpina", image_url: null }),
      product({ id: "b", name: "Prancha Nevada" }),
    ];
    const reply = "Temos a Prancha Alpina e a Prancha Nevada.";
    expect(ids(selectProductCards([searchCall(mixed)], reply))).toEqual(["a", "b"]);
  });

  it("does not card a product whose name is too short to match reliably", () => {
    const searched = [product({ id: "a", name: "XS" }), product({ id: "b", name: "Camiseta Larga" })];
    // "XS" is below the mention threshold, so even though it appears in the
    // reply it earns no card; only the explicitly named Camiseta Larga does.
    expect(ids(selectProductCards([searchCall(searched)], "temos a Camiseta Larga, também em tamanho XS"))).toEqual([
      "b",
    ]);
  });
});

describe("readMessageMetadata", () => {
  it("returns null for anything that is not a product-card payload", () => {
    expect(readMessageMetadata(null)).toBeNull();
    expect(readMessageMetadata("products")).toBeNull();
    expect(readMessageMetadata({})).toBeNull();
    expect(readMessageMetadata({ products: "nope" })).toBeNull();
    expect(readMessageMetadata({ products: [] })).toBeNull();
  });

  it("drops malformed cards but keeps the valid ones, so history always renders", () => {
    const parsed = readMessageMetadata({
      products: [
        {
          id: "a",
          name: "Prancha",
          description: "Leve e rápida.",
          price: "10.00",
          currency: "BRL",
          imageUrl: "https://x/a.jpg",
          url: "https://x/c/1",
        },
        { name: "missing an id" },
        null,
      ],
    });
    expect(parsed?.products).toEqual([
      {
        id: "a",
        name: "Prancha",
        description: "Leve e rápida.",
        price: "10.00",
        currency: "BRL",
        imageUrl: "https://x/a.jpg",
        url: "https://x/c/1",
      },
    ]);
  });

  it("keeps a card whose product had no URL, description or price", () => {
    const parsed = readMessageMetadata({ products: [{ id: "a", name: "Prancha", url: null }] });
    expect(parsed?.products[0]).toEqual({
      id: "a",
      name: "Prancha",
      description: null,
      price: null,
      currency: null,
      imageUrl: null,
      url: null,
    });
  });
});
