# Knowledge Base

Domain knowledge, glossary, and context that isn't obvious from the code itself.

## Overview

**Sidde** — platform where businesses "hire" pre-built AI employees. MVP ships one employee, **Malu** (AI sales rep), on one channel, **WhatsApp** only. Full spec: `Sidde_MVP_Specification.md` (repo root); original table sketch: `Sidde_MVP_Database_Tables.md` (repo root).

Core principle: Malu is channel-agnostic — she must not contain WhatsApp-specific logic. WhatsApp is a "workplace" plugged into a generic Conversation/Agent Engine, so future channels (website, Instagram) and future agents (Emma, Mia, ...) can be added without touching Malu.

Product framing matters: this is "hire an employee," not "configure an AI system" — merchant-facing language should be "Hire Malu" / "Teach Malu" / "Connect Malu to WhatsApp", never prompts/LLM/embeddings jargon.

## Glossary

- **Buying intent** — event fired when Malu detects the customer is ready to buy (e.g. "I'll take it", "send me the link"). Tracked, not treated as a sale.
- **Checkout click** — event fired when a customer clicks a Sidde-tracked link (`sidde.link/c/{tracking-id}`) that redirects to the merchant's own checkout/product page. The MVP does not process payments or in-chat checkout, and a checkout click must never be reported as a completed sale.
- **Agent Engine** — the reusable runtime that loads agent config + company/customer/conversation context, retrieves knowledge/products, calls the LLM, executes tools, and validates the response. Conceptual interface: `AgentEngine.run({ agent, company, customer, conversation, message })`.
- **ProductRepository** — abstraction Malu uses to search/get products (`search(query)`, `get(productId)`) regardless of source (CSV/XLSX import today; Shopify/WooCommerce/Nuvemshop/VTEX/API later). Malu must never know where products came from.
- **Grounding** — Malu must never invent prices, stock, policies, or product characteristics; factual answers must come from deterministic, database-backed tools (`search_products`, `get_product`, `get_business_information`, `get_policy_information`, `create_checkout_link`, `request_human`), not be hallucinated by the LLM.
- **WABA** — WhatsApp Business Account, Meta's container for a phone number's WhatsApp Cloud API access. A company's `company_whatsapp_connections.waba_id` references one.
- **Embedded Signup** — Meta's OAuth-style popup flow (Facebook Login for Business + JS SDK) that lets a merchant connect their own WhatsApp number without ever handling a token themselves; on success it hands the browser `{ code, waba_id, phone_number_id }`, which the backend exchanges server-to-server for a business access token (Trello D1).

## Notes

_TBD — anything future-you or Claude needs to know that isn't in the code._
