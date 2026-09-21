import { describe, expect, it } from "vitest";
import { UNGROUNDED_FALLBACK_TEXT } from "@/lib/agent-engine/constants";

// The canned line sent when a reply fails the grounding check twice used to say
// "Deixa eu confirmar ... e já te falo" -- a promise of a follow-up, from an
// agent that only ever speaks when the customer writes.
describe("UNGROUNDED_FALLBACK_TEXT", () => {
  it("states what is true now and promises nothing later", () => {
    expect(UNGROUNDED_FALLBACK_TEXT).not.toMatch(/já te (falo|retorno|aviso)|deixa eu (ver|verificar|confirmar)|vou (verificar|confirmar)/i);
    expect(UNGROUNDED_FALLBACK_TEXT).toContain("Não consigo confirmar essa informação agora");
  });
});
