---
version: 1
slug: "src-components-landing-hero-chat-demo-tsx"
primary_target: "src/components/landing/hero-chat-demo.tsx"
related_targets: ["src/components/landing/landing-page-2.tsx"]
---

# Landing hero

Scope: the logged-out landing's hero and header nav: `src/components/landing/landing-page-2.tsx` (hero section and nav) and the new `src/components/landing/hero-chat-demo.tsx`, plus the `LandingV2.hero` / `LandingV2.header` copy. This is block 1 of 3 in a sales rework. Block 2 (removing fabricated stats in other sections, honest proof and an ROI framing) and block 3 (pricing clarity) come later. Mode: **Persuade**.

Audience and job: a Brazilian business owner who sells or books appointments over WhatsApp (shop, salon, clinic) and arrives from search or an ad. In one viewport they should understand what they get and start the 7-day trial.

Constraints:
- Everything stays within the product language rules: no "agent", "RAG", "AI Workforce" or "LLM" in visible copy. The owner accepted keeping "IA" only in the SEO title (`Seo.defaultTitle`, unchanged).
- No fabricated metrics in the hero. The old 89.4%, 1.4s and 1,240 cards and the workspace illustration were removed.
- The chat is labelled "Conversa de exemplo" (sample chat), so it isn't mistaken for a real customer.
- The trial requires a card at checkout, so the copy never promises "no card".

## Direction contract

THESIS: a two-column hero. On the left, an outcome headline ("Venda e agende pelo WhatsApp / 24 horas por dia"), one supporting sentence that names Malu (sales) and Ana (appointments) and the no-invention promise, one primary CTA (trial) plus one secondary ("Ver funcionando" → #demo on desktop, "Falar com um especialista" on mobile), and three plain trust ticks. On the right, a WhatsApp-styled sample chat with a Vendas/Agendamentos switch: Malu recommending an in-stock product and sending the payment link, or Ana offering free slots and confirming an appointment. This replaces the centered wall of badge, headline, three-line jargon subtitle, three CTAs and three jargon ticks, and the below-the-fold Malu-only chat beside an illustration with fake metrics.

OWN-WORLD: the landing's existing indigo #3525cd on lilac #fcf8ff, the shader lines behind it, the ShutterReveal headline highlight and the SlideReveal entrance. The chat uses WhatsApp's own texture (beige dotted wall, green customer bubbles) so it reads as WhatsApp at a glance.

STORY: a salon owner lands on the page and sees "agende"; within 9 seconds the chat flips to Ana booking a haircut. A shop owner sees Malu selling first. Either can switch by hand, which stops the auto-rotation.

FIRST VIEWPORT: at 1440×900 and 1280×720, the headline, CTAs, ticks and the full chat. On a 390px phone, the headline, subtitle, CTAs and ticks, with the chat starting just below.

FORM: an extension of the established landing world. The user waived a concept roll by approving the proposed plan after the evaluation, verbatim: "bora".

Signature motion: the existing headline shutter and chat slide-in on load. The mode indicator glides, and bubbles cascade in (140ms stagger) only on a switch, never on first paint (the owner previously removed a typing-style entrance as too busy). Auto-rotation happens every 9s, pauses on hover or focus, stops on any manual choice, and is disabled under reduced motion.

FINISH: a build that is unreviewed and undocumented is unfinished. This one ends with the finish review, the verdict and the docs.

Amendment (2026-09-24, blocks 2 and 3): the hero subtitle's "Tudo pronto em 15 minutos" became "Tudo pronto em minutos" / "Ready in minutes", so the hero doesn't contradict the FAQ's setup-time answer ("menos de 30 minutos").
