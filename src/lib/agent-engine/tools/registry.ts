import type { AgentTool } from "./types";
import { searchProductsTool } from "./search-products";
import { getProductTool } from "./get-product";
import { createCheckoutLinkTool } from "./create-checkout-link";
import { flagBuyingIntentTool } from "./flag-buying-intent";
import { listServicesTool } from "./list-services";
import { findAvailableSlotsTool } from "./find-available-slots";
import { bookAppointmentTool } from "./book-appointment";
import { cancelAppointmentTool } from "./cancel-appointment";
import { getBusinessInformationTool } from "./get-business-information";
import { getPolicyInformationTool } from "./get-policy-information";
import { requestHumanTool } from "./request-human";

// The append-to-this-array registry: a future tool (checkout links, etc.)
// gets added here and needs no other wiring. deps.tools on AgentEngine.run
// overrides this entirely, which is how tests exercise the loop mechanics
// with fake single-purpose tools instead of touching Postgres.
//
// This is the full set of tools that *exist*; which tools a given agent is
// actually offered is resolved per-slug in tool-sets.ts (Trello J2). A tool
// added here is not automatically offered to anyone -- it has to be listed
// in an AGENT_TOOL_SETS entry too.
export const defaultTools: AgentTool[] = [
  searchProductsTool,
  getProductTool,
  createCheckoutLinkTool,
  flagBuyingIntentTool,
  listServicesTool,
  findAvailableSlotsTool,
  bookAppointmentTool,
  cancelAppointmentTool,
  getBusinessInformationTool,
  getPolicyInformationTool,
  requestHumanTool,
];
