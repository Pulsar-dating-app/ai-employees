# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Businesses of any size that sell through WhatsApp, Brazil-first. Primary language Portuguese; the product also ships English (next-intl, en/pt) for a broader bilingual audience. Not scoped to small/solo sellers specifically — the merchant side ranges from independent sellers to larger businesses, all evaluated on the same "hire an employee" mental model rather than a technical configuration model.

## Product Purpose

Staffra is a platform where businesses hire pre-built AI employees with defined personalities, roles, and capabilities. The MVP ships exactly one employee, Malu (an AI Sales Representative), scoped to WhatsApp only. Success for the MVP: a business can hire Malu, teach her about its business and products, connect her to WhatsApp, and have her naturally assist customers — generating measurable buying intent and checkout-link clicks.

## Positioning

"Malu is the employee. WhatsApp is her workplace." Staffra is not a chatbot-builder or agent-configuration tool — it's a hiring/onboarding experience for a pre-built AI staff member. A neighboring product could copy "AI + WhatsApp + product recommendations," but not the employee framing: no persona/prompt configuration is exposed to the merchant, and Malu's behavior is fixed, not customizable, in the MVP.

Long-term vision (not MVP scope, but shapes the mental model): "AI employees for your business" — multiple named agents (Malu today; Emma, Mia later) each with a distinct role, eventually reachable over multiple channels (WhatsApp today; website, Instagram later). Malu must not contain WhatsApp-specific logic — channel and agent are architecturally separate.

## Operating Context

Merchant journey: sign up → hire Malu → teach Malu (business info, products, shipping, returns, payments, FAQ, other) → connect WhatsApp → Malu is ready → customers talk to Malu on WhatsApp → Malu recommends products and sends a tracked checkout link → merchant reviews conversations/analytics in the admin dashboard.

Customer-side interaction happens entirely inside WhatsApp, not in the Staffra product surface — the customer should perceive "someone from this store is helping me," never a bot or a Staffra-branded experience.

Admin dashboard surfaces (current code): sign-up/login, dashboard home with a "hire" card, a "teach Malu" section (business info, FAQ, policy sub-sections), and a WhatsApp connect flow.

## Capabilities and Constraints

**MVP includes:** one fixed agent (Malu), WhatsApp channel only, product catalog (CSV/XLSX import + manual entry), business knowledge (info, shipping, returns, payments, FAQ, other), product recommendations, buying-intent detection, checkout-link click tracking, admin dashboard with conversations and basic analytics.

**MVP excludes:** multiple or custom agents, website chat, Instagram/TikTok, ecommerce platform integrations, in-chat checkout, payment processing, revenue attribution, advanced CRM/workflows. A checkout-link click is tracked as an event, never claimed as a completed sale.

**Grounding constraint:** Malu must never invent prices, stock, policies, or product characteristics — all factual claims are tool-grounded and database-backed, not left to the model's discretion.

**Product-language constraint (merchant- and customer-facing copy only):** never expose "agent," "prompt," "LLM," "AI," "embeddings," or other implementation jargon, in English or Portuguese. Use product language instead — "Hire Malu," "Teach Malu about your business," "Connect Malu to WhatsApp," "Malu is ready to work."

**i18n:** English and Portuguese via next-intl, cookie-based (no `/[locale]` URL segment). Agent names, roles, descriptions, company names, and other merchant-entered or DB-sourced content are data, not UI chrome, and stay as stored rather than being translated.

## Brand Commitments

Product name: **Staffra**. First (and currently only) agent: **Malu**, an AI Sales Representative with a defined personality — warm, friendly, confident, attentive, curious, conversational, knowledgeable, proactive, helpful, persuasive without being pushy. Malu must never sound like a generic chatbot or use excessive marketing language.

Target perception: the customer should feel "someone from this store is helping me"; the merchant should feel "I hired someone who is helping me sell." The whole product experience (onboarding, dashboard copy, flows) should read as hiring and onboarding an employee, not configuring an AI system.

No external logo, brand guide, or marketing site exists yet. The in-app design tokens in `src/app/globals.css` (warm neutral scale + a single dark accent, forced light mode, Geist Sans/Mono) are the closest thing to a defined visual identity today and are the incumbent authority for future visual work absent a documented DESIGN.md.

## Evidence on Hand

Malu herself — name, role, personality traits, behavioral rules, and example dialogue — is confirmed real product truth (see `Staffra_MVP_Specification.md`), not placeholder content.

No real merchant case studies, customer testimonials, live catalogs, or usage data exist yet; future work must not fabricate any. `public/` currently only holds the default Next.js starter SVGs (file/globe/next/vercel/window) — no real product imagery or logo.

## Product Principles

- **Help first, sell naturally.** Understand the customer and help them before recommending; recommend before pushing toward checkout.
- **Ground everything in data.** Never invent prices, stock, policies, or product facts — tools return deterministic, database-backed answers only.
- **Feel like an employee, not a tool.** Every surface — customer-facing chat and merchant-facing dashboard alike — should read as hiring/onboarding staff, never as configuring AI software.
- **Small, relevant, not exhaustive.** Recommend a few well-reasoned products rather than the whole catalog; retrieve only the knowledge relevant to the current question.
- **Honest measurement.** Buying intent and checkout clicks are leading indicators, tracked and reported as exactly that — never conflated with completed sales or revenue.
