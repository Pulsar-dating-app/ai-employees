# Knowledge Base

Domain knowledge, glossary, and context that isn't obvious from the code itself.

## Overview

**Sidde** — platform where businesses "hire" pre-built AI employees. Full spec: `Sidde_MVP_Specification.md` (repo root); original table sketch: `Sidde_MVP_Database_Tables.md` (repo root).

The spec was written around one employee, **Malu** (AI sales rep), on one channel, **WhatsApp**. Both have moved since, and the spec has not been rewritten — trust this file and the code over it on either point:

- **Agents**: `agents` holds several real, hireable, active rows (Malu, John, Ana the scheduling assistant). Nothing may assume Malu is the only one, or that an agent's name implies a gender.
- **Channels**: `conversation_channel` is `whatsapp` | `web_chat` | `instagram`. **Web chat** (epic M) shipped and is live. **Instagram** is the messaging channel now being built (epic N, decided 2026-08-31); its schema landed with N1. **WhatsApp** (epic D) is built but dormant — reachable in code, unmounted from the UI.
- **A channel connection belongs to an agent, not to the company** (N1). Web chat always worked that way (`/talk/{company}/{agent}`) and Instagram now does too, so one Instagram account answers exactly one hired employee. This is why there is no "which agent responds?" router in the product.

Core principle, unchanged and now load-bearing: an agent is channel-agnostic and must contain no channel-specific logic. A channel is a "workplace" plugged into a generic Conversation/Agent Engine — which is exactly why swapping WhatsApp for web chat and then Instagram touched no agent code at all.

Product framing matters: this is "hire an employee," not "configure an AI system" — merchant-facing language should be "Hire Malu" / "Teach Malu" / "Connect Malu to Instagram", never prompts/LLM/embeddings jargon.

## Glossary

- **Buying intent** — event fired when Malu detects the customer is ready to buy (e.g. "I'll take it", "send me the link"). Tracked, not treated as a sale.
- **Checkout click** — event fired when a customer clicks a Sidde-tracked link (`sidde.link/c/{tracking-id}`) that redirects to the merchant's own checkout/product page. The MVP does not process payments or in-chat checkout, and a checkout click must never be reported as a completed sale.
- **Agent Engine** — the reusable runtime that loads agent config + company/customer/conversation context, retrieves knowledge/products, calls the LLM, executes tools, and validates the response. Conceptual interface: `AgentEngine.run({ agent, company, customer, conversation, message })`.
- **ProductRepository** — abstraction Malu uses to search/get products (`search(query)`, `get(productId)`) regardless of source (CSV/XLSX import today; Shopify/WooCommerce/Nuvemshop/VTEX/API later). Malu must never know where products came from.
- **Grounding** — Malu must never invent prices, stock, policies, or product characteristics; factual answers must come from deterministic, database-backed tools (`search_products`, `get_product`, `get_business_information`, `get_policy_information`, `create_checkout_link`, `request_human`), not be hallucinated by the LLM.
- **WABA** — WhatsApp Business Account, Meta's container for a phone number's WhatsApp Cloud API access. A company's `company_whatsapp_connections.waba_id` references one.
- **Embedded Signup** — Meta's OAuth-style popup flow (Facebook Login for Business + JS SDK) that lets a merchant connect their own WhatsApp number without ever handling a token themselves; on success it hands the browser `{ code, waba_id, phone_number_id }`, which the backend exchanges server-to-server for a business access token (Trello D1).
- **Business Login for Instagram** — the Instagram equivalent, and epic N's chosen path (the "Instagram API *with Instagram Login*" flavour). The merchant signs in with their Instagram professional account directly: no Facebook Page and no Business Manager, which is the main onboarding advantage over Embedded Signup. Scopes `instagram_business_basic` + `instagram_business_manage_messages`; host is `graph.instagram.com`.
- **IGSID** — Instagram-scoped user id. The identifier for an Instagram customer, the way a phone number identifies a WhatsApp one. It is scoped to *your app*, so it is neither the @handle nor portable between apps.
- **24-hour window** — on both Meta messaging platforms you may only message a person within 24h of *their* last message. WhatsApp escapes it with paid pre-approved templates. **Instagram has no templates at all** (`ACCOUNT_UPDATE`, `CONFIRMED_EVENT_UPDATE` and one-time notifications are all unavailable there); its only escape is the `HUMAN_AGENT` tag, 7 days, and only for a real human replying. Practical consequence: nothing proactive — reminders, follow-ups, re-engagement — is possible on Instagram.

## Notes

_TBD — anything future-you or Claude needs to know that isn't in the code._
