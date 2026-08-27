// Step 6 -- no spec detail or future ticket (checked C3/C4/C5/C7) currently
// owns real intent classification. Stable placeholder so the pipeline has a
// well-defined slot to replace, not dead code to route around later --
// `message` is kept in the signature (unused for now) so a real
// implementation can slot in without callers changing.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function determineIntent(message: string): string {
  return "unknown";
}

// Step 10 -- pass-through. C7 implements the real check (e.g. rejecting a
// hallucinated price/stock claim per the Grounding principle).
export function validateResponse(responseText: string): string {
  return responseText;
}
