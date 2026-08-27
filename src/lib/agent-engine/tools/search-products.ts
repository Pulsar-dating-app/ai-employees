import { ProductRepository } from "@/lib/products/repository";
import type { AgentTool } from "./types";

type SearchProductsArgs = {
  text?: string;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  limit?: number;
};

// Step 5, tool #1 -- a real tool, not a stub. B5's ProductRepository was
// built specifically to be called this way (see its own file comment).
// companyId always comes from ctx, never from args, even though a model
// could never see another company's data anyway (ctx enforces it structurally).
export const searchProductsTool: AgentTool = {
  name: "search_products",
  description: "Search this company's product catalog by text, category, or price range.",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Free-text search, matched against name/description." },
      category: { type: "string" },
      priceMin: { type: "number" },
      priceMax: { type: "number" },
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
