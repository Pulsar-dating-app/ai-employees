// 2026-09-24 -- the shared `professionalId` argument and wording for Ana's
// scheduling tools once a business can have several professionals (one
// schedule each; see decisions.md "Multiple schedules per company"). A
// single-professional business never sees professionals in any result, so
// the argument simply stays unused there.

export const PROFESSIONAL_ID_PARAM = {
  type: "string",
  description:
    "Id of the professional the customer chose, from the `professionals` listed for this service " +
    "in list_services. Omit it only when list_services shows no `professionals` (the business has " +
    "one professional) or the customer said explicitly that any professional is fine.",
} as const;

export const PROFESSIONAL_RESULT_NOTE =
  "When the business has several professionals, each slot also has `professionals` -- who is " +
  "free at that time (exactly the one you asked for when you passed `professionalId`). When you " +
  "offer times without a chosen professional, say who each time is with. " +
  "`available: false` with `reason: \"professional_not_found\"` means that id isn't one of this " +
  "business's professionals, and `\"professional_not_for_service\"` means that professional " +
  "doesn't do this service (or nobody does) -- tell the customer who does it, using list_services.";

export function professionalIdArg(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
