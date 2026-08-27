import { ProductRepository } from "@/lib/products/repository";
import type { AgentTool } from "./types";

type GetProductArgs = {
  productId: string;
};

// Step 5, tool #2 -- companyId always comes from ctx (see search-products.ts
// for why), args.productId is the only model-controlled input.
export const getProductTool: AgentTool = {
  name: "get_product",
  description: "Fetch a single product from this company's catalog by id.",
  parameters: {
    type: "object",
    properties: {
      productId: { type: "string" },
    },
    required: ["productId"],
    additionalProperties: false,
  },
  async execute(rawArgs, ctx) {
    const args = rawArgs as GetProductArgs;
    return ProductRepository.get(ctx.companyId, args.productId, ctx.supabase);
  },
};
