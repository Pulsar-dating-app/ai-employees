import { describe, expect, it } from "vitest";
import {
  buildGroundingCorrectionInput,
  checkResponseGrounding,
  extractGroundingClaims,
  parseNumericToken,
} from "@/lib/agent-engine/grounding";
import type { SupabaseClient } from "@supabase/supabase-js";

// Trello ticket C7 -- step 10. The pure half (claim extraction + number
// parsing) is the real test surface here: every false positive it produces
// is a good reply replaced by "let me check that", and every miss is an
// invented price reaching a customer.

// Minimal Supabase stand-in for the cross-turn DB backstop. `products` is
// queried with .in(...) and `companies` with .maybeSingle(), so the two
// chains resolve differently.
function fakeSupabase({
  productRows = [] as Record<string, unknown>[],
  companyRow = null as Record<string, unknown> | null,
} = {}) {
  const queried: string[] = [];
  const client = {
    from: (table: string) => {
      queried.push(table);
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.in = chain;
      // The products query resolves on .limit(), the companies one on
      // .maybeSingle() -- mirrors the two real chains in grounding.ts.
      builder.limit = () => Promise.resolve({ data: productRows, error: null });
      builder.maybeSingle = () => Promise.resolve({ data: companyRow, error: null });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, queried };
}

function check(
  responseText: string,
  {
    toolResults = [] as { name: string; args: Record<string, unknown>; result: unknown }[],
    customerMessage = "",
    productRows = [] as Record<string, unknown>[],
    companyRow = null as Record<string, unknown> | null,
  } = {},
) {
  return checkResponseGrounding({
    responseText,
    toolResults,
    customerMessage,
    supabase: fakeSupabase({ productRows, companyRow }).client,
    companyId: "company-1",
  });
}

describe("parseNumericToken", () => {
  it("reads pt-BR and en decimal formats to the same value", () => {
    expect(parseNumericToken("89,90")).toEqual([89.9]);
    expect(parseNumericToken("89.90")).toEqual([89.9]);
    expect(parseNumericToken("1.299,90")).toEqual([1299.9]);
    expect(parseNumericToken("1,299.90")).toEqual([1299.9]);
  });

  it("keeps both readings only when a 3-digit tail makes the format genuinely ambiguous", () => {
    // "1.500" is 1500 in pt-BR and 1.5 in en -- nothing in the text says which.
    expect(parseNumericToken("1.500").sort()).toEqual([1.5, 1500]);
    // A 2-digit tail is unambiguously decimal in both locales, so no 8990.
    expect(parseNumericToken("89,90")).not.toContain(8990);
  });

  it("ignores tokens that aren't numbers", () => {
    expect(parseNumericToken("")).toEqual([]);
    expect(parseNumericToken("abc")).toEqual([]);
  });
});

describe("extractGroundingClaims", () => {
  it("catches prices written with a symbol, a currency word, or a price verb", () => {
    expect(extractGroundingClaims("Sai por R$ 89,90 😊").map((c) => c.kind)).toEqual(["price"]);
    expect(extractGroundingClaims("São 120 reais").map((c) => c.kind)).toEqual(["price"]);
    expect(extractGroundingClaims("Essa camiseta custa 59,90").map((c) => c.kind)).toEqual(["price"]);
    expect(extractGroundingClaims("It costs 49.99").map((c) => c.kind)).toEqual(["price"]);
  });

  // Nothing in the schema stores instalment plans, so every one of these is
  // arithmetic -- and the amount is usually written with no currency marker.
  it("catches an instalment amount, without matching a dimension", () => {
    expect(extractGroundingClaims("Fica 3x de 29,97 sem juros").map((c) => c.kind)).toEqual(["price"]);
    expect(extractGroundingClaims("Dá pra parcelar em 2x de R$ 44,95").map((c) => c.kind)).toEqual(["price"]);
    expect(extractGroundingClaims("O quadro é 30x40 cm")).toEqual([]);
  });

  it("catches stock quantities only next to an actual stock word", () => {
    expect(extractGroundingClaims("Restam 3 unidades").map((c) => c.kind)).toEqual(["stock"]);
    expect(extractGroundingClaims("Temos 2 em estoque").map((c) => c.kind)).toEqual(["stock"]);
    // A count of what the search returned is not a claim about stock.
    expect(extractGroundingClaims("Encontrei 3 opções pra você!")).toEqual([]);
    expect(extractGroundingClaims("Temos 4 modelos dessa linha")).toEqual([]);
  });

  it("ignores numbers with no money or stock marker at all", () => {
    expect(extractGroundingClaims("O tamanho 42 fica ótimo, e chega rapidinho 😊")).toEqual([]);
  });

  it("ignores digits inside links", () => {
    // C4's checkout links and merchant product_urls are full of digits.
    expect(extractGroundingClaims("Segue o link: https://loja.com/p/199?ref=90 reais")).toEqual([]);
  });

  it("ignores percentages, which no column stores and nothing could ground", () => {
    expect(extractGroundingClaims("São 10% de desconto")).toEqual([]);
  });
});

describe("checkResponseGrounding", () => {
  it("passes a reply with no figures at all without touching the database", async () => {
    const supabase = fakeSupabase();
    const result = await checkResponseGrounding({
      responseText: "Claro! Me conta um pouco do que você procura 😊",
      toolResults: [],
      customerMessage: "oi",
      supabase: supabase.client,
      companyId: "company-1",
    });

    expect(result.grounded).toBe(true);
    // The common case has to cost nothing -- most replies quote no figure.
    expect(supabase.queried).toEqual([]);
  });

  it("grounds a price that a tool actually returned, across number formats", async () => {
    const result = await check("Essa camiseta sai por R$ 89,90 😊", {
      // PostgREST returns numeric columns as strings -- the exact shape B5's
      // ProductRepository hands back.
      toolResults: [{ name: "search_products", args: {}, result: [{ name: "Camiseta", price: "89.90", stock: 4 }] }],
    });

    expect(result.grounded).toBe(true);
  });

  it("blocks a price that appears nowhere in this turn's tool results or the catalog", async () => {
    const result = await check("Essa camiseta sai por R$ 199,90!", {
      toolResults: [{ name: "search_products", args: {}, result: [{ name: "Camiseta", price: "89.90" }] }],
    });

    expect(result.grounded).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({ kind: "price" });
    expect(result.violations[0].values).toContain(199.9);
  });

  it("blocks a total the model added up itself, even from two real prices", async () => {
    // 89.90 + 49.90 -- both real, the sum is not a retrieved fact and could
    // simply be wrong. See the matching GROUNDING_GUARDRAIL sentence.
    const result = await check("As duas juntas ficam R$ 139,80", {
      toolResults: [{ name: "search_products", args: {}, result: [{ price: "89.90" }, { price: "49.90" }] }],
    });

    expect(result.grounded).toBe(false);
  });

  it("treats a figure the customer themselves stated as grounded", async () => {
    const result = await check("Perfeito, então vamos ficar até R$ 200 😊", {
      customerMessage: "tenho no máximo 200 reais pra gastar",
    });

    expect(result.grounded).toBe(true);
  });

  it("grounds a figure retrieved on an earlier turn by checking the real catalog", async () => {
    // The price was looked up two turns ago; OpenAI holds that history
    // server-side, so this process has no tool result for it. Without the DB
    // backstop this would be a false block on an ordinary restatement.
    const result = await check("Isso, a camiseta é R$ 89,90 mesmo!", {
      toolResults: [],
      productRows: [{ price: "89.90" }],
    });

    expect(result.grounded).toBe(true);
  });

  it("grounds a figure that lives in the company's own policy text", async () => {
    const result = await check("O frete é grátis acima de R$ 200 😊", {
      companyRow: { shipping_policy: "Frete grátis para compras acima de R$ 200,00." },
    });

    expect(result.grounded).toBe(true);
  });

  it("blocks a stock quantity no product actually has", async () => {
    const result = await check("Restam 7 unidades!", {
      toolResults: [{ name: "get_product", args: {}, result: { name: "Camiseta", stock: 2 } }],
      productRows: [],
    });

    expect(result.grounded).toBe(false);
    expect(result.violations[0]).toMatchObject({ kind: "stock" });
  });

  it("surfaces a Postgres error from the backstop rather than blocking every reply", async () => {
    const failing = {
      from: () => {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.eq = chain;
        builder.in = chain;
        builder.limit = () => Promise.resolve({ data: null, error: { message: "boom", code: "XX000" } });
        builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
        return builder;
      },
    } as unknown as SupabaseClient;

    await expect(
      checkResponseGrounding({
        responseText: "Sai por R$ 12,00",
        toolResults: [],
        customerMessage: "quanto custa?",
        supabase: failing,
        companyId: "company-1",
      }),
    ).rejects.toMatchObject({ code: "XX000" });
  });

  it("does not ground an unrelated figure just because the customer mentioned some number", async () => {
    const result = await check("Sai por R$ 350", { customerMessage: "tenho 200 reais" });

    expect(result.grounded).toBe(false);
  });
});

describe("buildGroundingCorrectionInput", () => {
  it("uses the developer role and names the exact rejected figure", () => {
    const input = buildGroundingCorrectionInput([{ kind: "price", text: "R$ 199,90", values: [199.9] }]);

    expect(input).toHaveLength(1);
    // Never `user` -- a later turn must not read this as something the
    // customer said.
    expect(input[0].role).toBe("developer");
    expect(input[0].content).toContain("R$ 199,90");
    expect(input[0].content).toContain("was NOT sent to the customer");
  });
});
