// Step 6 -- no spec detail or future ticket (checked C3/C4/C5/C7) currently
// owns real intent classification. Stable placeholder so the pipeline has a
// well-defined slot to replace, not dead code to route around later --
// `message` is kept in the signature (unused for now) so a real
// implementation can slot in without callers changing.
//
// Step 10 used to live here too, as a pass-through `validateResponse`.
// Trello C7 replaced it with the real grounding check (`grounding.ts`), so
// this file is down to one stub.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function determineIntent(message: string): string {
  return "unknown";
}
