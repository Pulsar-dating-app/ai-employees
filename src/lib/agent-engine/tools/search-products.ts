import { ProductRepository } from "@/lib/products/repository";
import type { AgentTool } from "./types";

type SearchProductsArgs = {
  keywords?: string[];
  category?: string;
  priceMin?: number;
  priceMax?: number;
  limit?: number;
};

// Step 5, tool #1 -- a real tool, not a stub. B5's ProductRepository was
// built specifically to be called this way (see its own file comment).
// companyId always comes from ctx, never from args, even though a model
// could never see another company's data anyway (ctx enforces it structurally).
//
// `keywords` (plural) rather than a single `text` string is deliberate --
// see the 2026-08-27 decisions.md entry. Asking the model for a handful of
// related terms instead of one literal phrase costs no extra LLM round
// trip (it's the same tool-call turn the model was already making), but
// meaningfully improves recall: a customer rarely uses the catalog's exact
// words, and the old single-phrase match required every word to appear
// verbatim, in order, in name/description (see repository.ts's own
// history) -- a real product could be invisible to a perfectly reasonable
// search. ProductRepository.search treats each keyword as an independent
// OR'd alternative, ranked by how well it matched overall.
export const searchProductsTool: AgentTool = {
  name: "search_products",
  description: "Search this company's product catalog by keyword, category, or price range.",
  parameters: {
    type: "object",
    properties: {
      keywords: {
        type: "array",
        items: { type: "string" },
        description:
          "2-5 short search terms describing what the customer wants. Include their literal " +
          "words plus a few reasonable synonyms, alternate phrasings, or closely related product " +
          "types -- e.g. for \"camiseta azul masculina\", try [\"camiseta azul\", \"camisa " +
          "masculina\", \"blusa azul\"]. A product matches if it matches ANY of these terms, " +
          "ranked by how well it matched overall -- so it's fine to be a little generous, but " +
          "stay grounded in what the customer actually described; don't invent unrelated product " +
          "types just to widen the net.\n\n" +
          "If the customer names a general CATEGORY rather than a specific item (e.g. \"calçado\", " +
          "\"roupa\", \"eletrônico\", \"footwear\", \"clothes\"), the catalog's product names/" +
          "descriptions almost never contain that abstract category word itself -- searching for " +
          "\"calçado\" literally will find nothing even if the catalog is full of shoes. Instead, " +
          "expand it into several concrete product types that word usually refers to, e.g. for " +
          "\"calçado\": [\"tênis\", \"sapato\", \"sandália\", \"bota\", \"chinelo\"]. A single " +
          "empty search result does not mean the store has nothing in that category -- it means " +
          "that specific wording didn't match; broaden to concrete product types before telling " +
          "the customer something isn't available.",
      },
      category: {
        type: "string",
        description:
          "Exact category value as stored in the catalog (case-sensitive, must match exactly -- " +
          "an incorrect guess returns zero results with no error). Only set this if you already " +
          "know the real value, e.g. from a `category` field on a product returned by an earlier " +
          "search. Never guess a category from customer language (like a gender or style word) -- " +
          "leave this out and rely on `keywords` instead.",
      },
      priceMin: {
        type: "number",
        description:
          "Minimum price, in the store's own currency, as a plain number (no currency symbol, " +
          "no formatting) -- e.g. for \"acima de R$50\", pass 50. Omit unless the customer stated " +
          "or clearly implied a lower bound.",
      },
      priceMax: {
        type: "number",
        description:
          "Maximum price, in the store's own currency, as a plain number (no currency symbol, " +
          "no formatting) -- e.g. for \"até 50 reais\" or \"mais barato que R$50\", pass 50. For a " +
          "relative request with no number (\"o mais barato\", \"algo mais em conta\"), don't " +
          "guess a value here -- just search normally and pick the cheapest product from the " +
          "results yourself, since you can already see each one's price.",
      },
      limit: { type: "number", description: "Max results, defaults to 5." },
    },
    additionalProperties: false,
  },
  async execute(rawArgs, ctx) {
    const args = rawArgs as SearchProductsArgs;
    // Spread args FIRST -- companyId must win even if a model-supplied
    // args object smuggled its own `companyId` key. ctx.supabase is passed
    // through so this tool honors whatever client run() was given (real
    // service client in production, an injected test client otherwise) --
    // ProductRepository must never build its own here.
    const products = await ProductRepository.search({ ...args, companyId: ctx.companyId }, ctx.supabase);
    return products;
  },
};
