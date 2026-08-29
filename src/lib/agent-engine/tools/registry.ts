import type { AgentTool } from "./types";
import { searchProductsTool } from "./search-products";
import { getProductTool } from "./get-product";
import { createCheckoutLinkTool } from "./create-checkout-link";
import { flagBuyingIntentTool } from "./flag-buying-intent";
import { getBusinessInformationTool } from "./get-business-information";
import { getPolicyInformationTool } from "./get-policy-information";
import { requestHumanTool } from "./request-human";

// The append-to-this-array registry: a future tool (checkout links, etc.)
// gets added here and needs no other wiring. deps.tools on AgentEngine.run
// overrides this entirely, which is how tests exercise the loop mechanics
// with fake single-purpose tools instead of touching Postgres.
export const defaultTools: AgentTool[] = [
  searchProductsTool,
  getProductTool,
  createCheckoutLinkTool,
  flagBuyingIntentTool,
  getBusinessInformationTool,
  getPolicyInformationTool,
  requestHumanTool,
];
