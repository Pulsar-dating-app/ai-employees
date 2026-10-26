import { describe, expect, it } from "vitest";
import { merchantEmailLanguage, renderMerchantNudgeEmail, type MerchantNudgeData } from "@/lib/email/merchant-nudges";

const data: MerchantNudgeData = {
  ownerName: "Zé",
  companyName: "Barbearia do Zé",
  agentName: "Ana",
  scheduling: true,
  chatUrl: "https://staffra.io/talk/barbearia-do-ze/ana",
  ctaUrl: "https://staffra.io/api/nudges/click?k=not_live",
};

// Acronyms case-sensitive: Italian "ai" ("ai tuoi clienti") is a preposition.
const ACRONYMS = /\b(IA|AI|LLM)\b/;
const JARGON = /\b(agente|agent|prompt|bot|chatbot)\b/i;

describe("merchant nudge e-mails", () => {
  it("puts the hire's link in the not-live e-mail", () => {
    const mail = renderMerchantNudgeEmail("not_live", data, "pt");
    expect(mail.subject).toContain("Ana");
    expect(mail.text).toContain(data.chatUrl!);
    expect(mail.html).toContain(data.ctaUrl);
  });

  it("works for a merchant who stopped before hiring anyone", () => {
    const mail = renderMerchantNudgeEmail("onboarding_stalled", { ...data, agentName: null, chatUrl: null }, "pt");
    expect(mail.subject).not.toContain("null");
    expect(mail.text).toContain("Barbearia do Zé");
  });

  it("escapes merchant-entered text in the HTML", () => {
    const mail = renderMerchantNudgeEmail("onboarding_stalled", { ...data, companyName: "<b>Zé</b>" }, "pt");
    expect(mail.html).not.toContain("<b>Zé</b>");
  });

  it("never uses implementation jargon, in any language", () => {
    for (const lang of ["pt", "en", "it"] as const) {
      for (const kind of ["onboarding_stalled", "not_live"] as const) {
        const mail = renderMerchantNudgeEmail(kind, data, lang);
        const copy = `${mail.subject}\n${mail.text}`;
        expect(copy).not.toMatch(ACRONYMS);
        expect(copy).not.toMatch(JARGON);
      }
    }
  });

  it("picks the language from the business's country", () => {
    expect(merchantEmailLanguage(null)).toBe("pt");
    expect(merchantEmailLanguage("BR")).toBe("pt");
    expect(merchantEmailLanguage("IT")).toBe("it");
    expect(merchantEmailLanguage("US")).toBe("en");
  });
});
