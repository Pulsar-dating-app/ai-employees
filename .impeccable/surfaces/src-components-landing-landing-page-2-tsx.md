---
version: 1
slug: "src-components-landing-landing-page-2-tsx"
primary_target: "src/components/landing/landing-page-2.tsx"
related_targets: ["src/components/landing/pricing-section.tsx"]
---

# Landing page (blocks 2 and 3: trust and pricing)

Scope: everything below the hero on the logged-out landing. Files: `src/components/landing/landing-page-2.tsx`, `pricing-section.tsx` (rewritten), `value-calculator.tsx`, `product-tour.tsx`, plus small label changes in `channel-showcase.tsx`, and the copy under `LandingV2.*` and `Seo.description` (en and pt). The hero was block 1 and has its own brief (`src-components-landing-hero-chat-demo-tsx.md`). Mode: **Persuade**. The goal set by the owner, verbatim: "A landing page tem que converter o cliente, esse é o objetivo."

Audience and job: a Brazilian business owner who sells or books over WhatsApp. After the hero they need, in order: who they hire, where it works, that it can be trusted, whether it's worth the money, and which plan to pick. Then they start the trial.

Constraints:
- **Truth over hype.** No fabricated metrics or social proof: the impact band (−55%, 3.8x, 99.4%) and "Mais escolhido por empresas" were removed.
- **No capability the product lacks.** Removed: PDF or history upload, "tom de voz / guardrails" configuration, QR-code WhatsApp setup, SOC2, "follow-up automático".
- **Every price and number comes from the catalog.** Prices, per-day equivalents and reply counts come from `plans.ts` (`getSelfServePlansForVariant`, `getPlan`). The "R$ X por dia" in the comparison uses the Starter monthly price divided by 30, rounded up.
- **Trial terms stated exactly:** card up front, charge after 7 days or 500 replies (whichever first), cancel before and pay nothing.
- **Product language.** No "agente", "RAG", "AI Workforce", "IA" or "OpenAI" in visible copy. "IA" stays only in the SEO title. The OpenAI logo was dropped from the "works with" strip.
- **SEO structured data.** The JSON-LD still reads `pricing.plans[].{tier,name,desc,price}` and `faq.items[].{q,a}`, so both shapes are kept.

## Direction contract

THESIS: a page that answers buying questions in order and repeats one action. The sections run:
1. Hero
2. Strip of tools it works with
3. Who: Malu and Ana cards, each with "Contratar a {name}"
4. Where: the channel showcase
5. See it: `#demo`, a 5-step tour of real dashboard screenshots (Conversas, Canais, Catálogo, Agenda, Desempenho), captured from a seeded sample account and labelled "Capturas reais do painel, com dados de exemplo". Shown on mobile too, as a zoomed crop
6. Trust: "Ela nunca inventa preço, estoque ou prazo", three honest setup steps and the answer-sources card
7. Value: "Uma funcionária que não tira folga". Two cards: weekly coverage bars (44h CLT limit vs 168h) with four honest facts, and a calculator (cost per attendant × count vs the recommended plan's price, computed in the browser, nothing sent). The saving line only appears when it's real, and a disclaimer says Staffra doesn't need to replace anyone. Then the trial CTA
8. Pricing: the only difference shown per card is replies per month or year, plus the price and a per-day line. "Recomendado" on the middle card, one shared "Tudo isso em todos os planos" list, and the exact trial note
9. FAQ with 6 real objections
10. Final CTA: "Seu próximo cliente pode chegar às 23h. Quem vai responder?"

It replaces the old Stitch-mockup copy, 36 near-identical features per plan card, the fake stats band and the uppercase eyebrows on every section.

OWN-WORLD: the landing's indigo #3525cd on lilac #fcf8ff and #f5f2ff bands, white 24px-radius cards with hairline lilac rings, green #10b981 checks, and the sliding pill indicator shared with the dashboard. Headings are sentence case, with no uppercase tracked eyebrows.

STORY: the visitor learns there are two employees, sees them work on the channels their customers use, is reassured that nothing gets made up, compares the cost with a human-only setup, sees three plans where only volume differs, reads that the trial is risk-free until 7 days or 500 replies, and clicks "Testar 7 dias grátis", which appears in the header, hero, workforce, value, pricing and final sections.

FIRST VIEWPORT: unchanged from block 1.

FORM: an extension of the established landing world. No concept roll was run. The owner set the scope ("Faça o numero 2 e 3 junto") after approving the three-block plan, and did not explicitly waive a roll.

Signature motion:
- Existing reveals.
- Pricing cards cascade in, and prices re-animate when a toggle changes.
- The period indicator glides.
- Nothing counts up anymore (CountUp was removed with the fake stats).

FINISH: a build that is unreviewed and undocumented is unfinished. This one ends with the finish review, the verdict and the docs.


FORM: no seed key. No concept roll was run for this surface, and the owner has not explicitly waived one.

WhatsApp truth (2026-09-24): WhatsApp only works on `_wpp` plans. The pricing toggle is "Com WhatsApp", the included list and FAQ say WhatsApp comes on WhatsApp plans, and the calculator quotes the recommended plan with WhatsApp.
