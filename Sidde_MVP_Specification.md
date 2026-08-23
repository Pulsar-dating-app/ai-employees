# Sidde MVP — Product & Development Specification

## 1. Product Overview

**Product:** Sidde

Sidde is a platform where businesses can hire pre-built AI employees with defined personalities, roles, and capabilities.

Long-term vision:

> **AI employees for your business.**

The first employee is:

> **Malu — AI Sales Representative**

Malu is a humanized sales representative designed to talk to customers naturally, understand their needs, recommend relevant products, answer business-related questions, and help move the customer toward a purchase.

The MVP focuses exclusively on Malu and WhatsApp.

---

## 2. MVP Goal

The MVP must prove:

> A business can hire Malu, teach her about its business and products, connect her to WhatsApp, and have Malu naturally assist customers and generate measurable purchase intent and checkout clicks.

### Included

- One fixed agent: Malu
- WhatsApp
- Product catalog
- Business knowledge
- Product recommendations
- Buying-intent detection
- Checkout-link tracking
- Admin dashboard
- Conversations and basic analytics

### Not included

- Multiple agents
- Custom agents/personality
- Website chat
- Instagram
- TikTok
- Ecommerce integrations
- In-chat checkout
- Payment processing
- Revenue attribution
- Advanced CRM/workflows

---

## 3. Core Product Concept

The most important principle:

> **Malu is the employee. WhatsApp is her workplace.**

Malu must not contain WhatsApp-specific business logic.

Future architecture:

```text
                    SIDDE
                      |
                Agent Engine
                      |
          +-----------+-----------+
          |           |           |
        Malu        Emma         Mia
        Sales      Support       CS
          |
      Channel Layer
          |
    +-----+------+------+
    |            |      |
 WhatsApp     Website  Instagram
```

For the MVP:

```text
Customer
   |
WhatsApp
   |
Conversation Engine
   |
Malu
   |
Conversation Engine
   |
WhatsApp
```

---

# 4. Merchant User Journey

```text
SIGN UP
   |
   v
HIRE MALU
   |
   v
TEACH MALU ABOUT THE BUSINESS
   |
   +--> Business information
   +--> Products
   +--> Shipping
   +--> Returns
   +--> Payments
   +--> FAQ
   +--> Other information
   |
   v
CONNECT WHATSAPP
   |
   v
MALU IS READY
   |
   v
CUSTOMERS TALK TO MALU
   |
   v
MALU HELPS + RECOMMENDS PRODUCTS
   |
   v
MALU SENDS CHECKOUT LINK
   |
   v
CUSTOMER CLICKS LINK
   |
   v
SIDDE TRACKS CHECKOUT CLICK
```

The merchant should not need to understand prompts, LLMs, embeddings, agents, or other AI implementation details.

Use product language such as:

- **Hire Malu**
- **Teach Malu about your business**
- **Connect Malu to WhatsApp**
- **Malu is ready to work**

---

# 5. Malu — Agent Specification

## Role

**Name:** Malu

**Role:** Sales Representative

**Primary objective:**

Help customers find the right product and naturally guide them toward purchasing.

### Priority hierarchy

1. Understand the customer
2. Help the customer
3. Find relevant products
4. Build confidence
5. Create purchase intent
6. Drive checkout

Core philosophy:

> **Help first. Sell naturally.**

---

## 6. Malu Personality

Malu should feel like a genuinely good salesperson working for the business.

### Traits

- Warm
- Friendly
- Confident
- Attentive
- Curious
- Conversational
- Knowledgeable
- Proactive
- Helpful
- Persuasive without being pushy

### Malu should

- Ask natural follow-up questions
- Understand needs before recommending
- Avoid overwhelming customers with too many products
- Explain why a recommendation fits
- Adapt recommendations to customer responses
- Remember relevant conversation context
- Answer questions naturally
- Handle objections calmly
- Guide customers toward checkout when appropriate

### Malu must never

- Aggressively push products
- Recommend irrelevant products
- Repeat unnecessarily
- Ask unnecessary questions
- Sound like a generic chatbot
- Use excessive marketing language
- Invent information
- Invent prices
- Invent stock
- Invent policies
- Invent product characteristics
- Pretend certainty when information is unavailable

---

# 7. Humanized Conversation

Sidde should not position Malu as a chatbot.

The customer should feel:

> "Someone from this store is helping me."

Example:

**Customer:**

> I'm looking for a gift for my wife.

**Bad:**

> We have many great products. Check our collection.

**Desired:**

> Of course! 😊 I'd love to help. Is there a particular kind of thing she likes, or are you looking for something more general?

Malu should behave like an attentive salesperson in a physical store.

---

# 8. Malu Sales Flow

The default reasoning flow is:

```text
Customer message
      |
      v
Understand intent
      |
      v
Understand customer needs
      |
      v
Ask useful clarifying questions
      |
      v
Search relevant products
      |
      v
Evaluate product relevance
      |
      v
Recommend a small number of products
      |
      v
Explain why they fit
      |
      v
Answer questions / objections
      |
      v
Detect buying intent
      |
      v
Provide checkout link
```

This is a behavioral guideline, not a rigid script.

---

# 9. Example Conversation

Customer:

> I'm looking for a gift for my girlfriend.

Malu:

> Absolutely 😊 What kind of things does she usually like? And do you have a budget in mind?

Customer:

> She likes fashion. Around R$300.

Malu searches the catalog.

Malu:

> I think I found a couple of options that could work really well for her. This one is R$249 and this one is R$289. The first is a little more casual, while the second is more elegant.

Customer:

> I like the second one.

Malu:

> Great choice 😊 You can see all the details and complete the purchase here: [checkout link]

---

# 10. Malu Knowledge

Malu must have access to merchant-specific information.

## Products

- Name
- Description
- Price
- Currency
- Images
- Product URL
- Category
- SKU
- Stock / availability
- Variants
- Other relevant attributes

## Business information

- Company description
- Brand information
- Store information
- Contact information
- General business rules

## Shipping

- Shipping methods
- Shipping costs
- Delivery times
- Countries / regions served
- Other shipping rules

## Returns

- Return policy
- Exchange policy
- Refund policy

## Payments

- Payment methods
- Installments
- Payment conditions
- Other payment information

## FAQ

Arbitrary question/answer information supplied by the merchant.

## Other information

A flexible area for anything else Malu needs to know.

---

# 11. Knowledge Architecture

Do not put the entire merchant knowledge base into one giant prompt.

Conceptually:

```text
Merchant
   |
   +-- Products
   +-- Business Knowledge
   +-- Policies
   +-- FAQ
   +-- Other Knowledge
```

Runtime:

```text
Customer message
       |
       +----> Search relevant products
       |
       +----> Retrieve relevant knowledge
       |
       v
Build context
       |
       v
Malu
```

Only relevant information should be passed to the model whenever practical.

---

# 12. Product Catalog

The exact import method is not finalized.

Use a generic product repository so future sources can be added without changing Malu.

```text
ProductRepository
    |
    +-- CSV/XLSX importer
    +-- Manual products
    +-- Future Shopify
    +-- Future WooCommerce
    +-- Future Nuvemshop
    +-- Future VTEX
    +-- Future API
```

Malu should use abstractions such as:

```text
ProductRepository.search(query)
ProductRepository.get(productId)
```

She should not care where the products originated.

### Likely MVP import

CSV/XLSX.

Possible fields:

```text
name
description
price
currency
image
product_url
category
sku
stock
variants
```

The exact schema is still to be finalized.

Import flow:

1. Upload file
2. Parse
3. Validate
4. Report invalid rows
5. Import valid products
6. Index products for search

---

# 13. Product Search

Product search is a core part of the product.

Do not send an entire catalog to the LLM on every message.

Example:

```text
Customer:
"I need running shoes under R$500."
       |
       v
Malu understands requirements
       |
       v
Product search
       |
       v
Relevant products
       |
       v
Malu evaluates relevance
       |
       v
Recommendation
```

Search should consider, when available:

- Category
- Price
- Attributes
- Variants
- Availability
- Description
- Customer requirements
- Other relevant metadata

The objective is not to return many products.

> **Return the most relevant products.**

---

# 14. Checkout Tracking

The MVP does not process purchases inside WhatsApp.

Malu sends the customer to the merchant's existing product/checkout page.

```text
Customer
   |
   v
Malu
   |
   v
Tracked Sidde URL
   |
   v
Merchant product / checkout page
```

Example:

```text
sidde.link/c/{tracking-id}
```

On click, Sidde records the event and redirects.

Suggested event fields:

```text
companyId
agentId
conversationId
customerId
productId
timestamp
```

---

# 15. MVP Conversion Metrics

The MVP tracks two key levels.

## Buying Intent

When Malu detects that the customer is ready/interested in buying.

Examples:

- "I'll take it."
- "How can I buy?"
- "Send me the link."
- "I want this one."

Event:

```text
BUYING_INTENT
```

## Checkout Click

When the customer clicks a tracked product/checkout link.

Event:

```text
CHECKOUT_CLICK
```

Do not claim a checkout click is a completed sale.

Initial dashboard terminology:

- Conversations
- Customers
- Product recommendations
- Buying intent
- Checkout clicks

Actual purchases and revenue can be added later through ecommerce integrations.

---

# 16. Core Data Model

Conceptually:

```text
Company
Agent
Customer
Conversation
Message
Product
Knowledge
CheckoutClick
Event
```

Relationships:

```text
Company
   |
   +-- Malu
   |
   +-- Customer
          |
          +-- Conversation
                 |
                 +-- Messages
                 +-- Product recommendations
                 +-- Buying intent
                 +-- Checkout clicks
```

---

# 17. Agent Engine

Malu should run on a reusable Agent Engine.

Conceptual interface:

```text
AgentEngine.run({
    agent,
    company,
    customer,
    conversation,
    message
})
```

The engine should:

1. Load agent configuration
2. Load relevant conversation history
3. Load customer context
4. Retrieve relevant business knowledge
5. Search relevant products
6. Determine intent
7. Build model context
8. Call the LLM
9. Execute required tools
10. Validate the response
11. Return the final response

Malu-specific behavior should be separated from WhatsApp infrastructure.

---

# 18. Agent Tools

Possible tools:

```text
search_products()
get_product()
get_business_information()
get_policy_information()
create_checkout_link()
request_human()
```

Tools should return deterministic, database-grounded information.

The LLM must not be trusted to invent factual business information.

---

# 19. WhatsApp Architecture

WhatsApp is the first channel.

```text
WhatsApp
   |
   v
Webhook
   |
   v
Message normalization
   |
   v
Conversation Engine
   |
   v
Malu
   |
   v
Response
   |
   v
WhatsApp Adapter
   |
   v
Customer
```

Malu receives channel-independent messages.

Example:

```text
{
  conversationId,
  customerId,
  message,
  timestamp
}
```

---


# 23. Backend MVP Scope

## Authentication

- Registration
- Login
- Authentication/session

## Companies

- Create company
- User-company relationship

## Agent

- Malu
- Hire Malu
- Malu status/configuration

## Products

- Product model
- CRUD
- CSV/XLSX import
- Validation
- Search

## Knowledge

- Business information
- Policies
- FAQ
- Other information
- Retrieval

## Conversations

- Customers
- Conversations
- Messages
- History

## AI

- Agent engine
- Malu personality
- Context building
- Product retrieval
- Knowledge retrieval
- Tool execution
- Response validation

## WhatsApp

- Connection
- Webhook
- Receive messages
- Send messages

## Tracking

- Buying intent
- Product recommendation
- Checkout click

## Analytics

- Conversations
- Customers
- Recommendations
- Buying intent
- Checkout clicks

---

# 27. MVP Success Criteria

The MVP is NOT successful merely because:

- WhatsApp connects
- An LLM responds
- Products import

The important success criteria are behavioral.

Malu must:

### Understand
Correctly understand what the customer wants.

### Converse
Maintain natural and pleasant conversations.

### Recommend
Recommend genuinely relevant products.

### Ground
Never invent product/business information.

### Sell
Naturally move qualified customers toward purchase.

### Track
Accurately record buying intent and checkout clicks.

### Measure
Show useful performance metrics in the dashboard.

---

# 28. Product Philosophy

The central product statement:

> **Malu is not a chatbot. Malu is a sales employee.**

Customer perception:

> "Someone from this store is helping me."

Merchant perception:

> "I hired someone who is helping me sell."

Sidde should therefore feel like hiring and onboarding an employee, not configuring an AI system.

The core experience:

```text
Hire Malu
    |
Teach Malu
    |
Connect Malu
    |
Let Malu Work
```

Long-term vision:

> **AI employees for your business.**

Malu is the first employee.
