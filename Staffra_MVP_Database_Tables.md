# Staffra MVP --- Database Tables

## users

  Column          Type          Nullable Description
  --------------- ----------- ---------- --------------------
  id              UUID                NO Primary key
  email           VARCHAR             NO User email
  name            VARCHAR            YES User name
  created_at      TIMESTAMP           NO Creation timestamp
  updated_at      TIMESTAMP          YES Last update

## companies

  Column                    Type           Nullable Description
  ------------------------- ------------ ---------- ----------------------
  id                        UUID                 NO Primary key
  name                      VARCHAR             YES Business/store name
  email                     VARCHAR             YES Business email
  phone                     VARCHAR             YES Business phone
  website_url               VARCHAR             YES Website
  description               TEXT                YES Business description
  shipping_policy           TEXT                YES Shipping policy
  return_policy              TEXT                YES Return policy
  payment_policy             TEXT                YES Payment policy
  faq                        JSONB               YES Frequently asked questions
  additional_information     TEXT                YES Extra business knowledge/context
  currency                  VARCHAR(3)          YES Default currency
  country                   VARCHAR             YES Country
  timezone                  VARCHAR             YES Timezone
  created_at                TIMESTAMP            NO Creation timestamp
  updated_at                TIMESTAMP           YES Last update

## company_users

  Column       Type          Nullable Description
  ------------ ----------- ---------- --------------------
  id           UUID                NO Primary key
  company_id   UUID                NO FK to companies
  user_id      UUID                NO FK to users
  role         VARCHAR            YES owner/admin/member
  created_at   TIMESTAMP           NO Creation timestamp
  updated_at   TIMESTAMP          YES Last update

## agents

  Column          Type          Nullable Description
  --------------- ----------- ---------- --------------------------------
  id              UUID                NO Primary key
  slug            VARCHAR             NO Internal identifier, e.g. malu
  role            VARCHAR            YES Agent role
  description     TEXT               YES Agent description
  personality     TEXT               YES Base personality
  system_prompt   TEXT               YES Agent instructions
  is_active       BOOLEAN            YES Available for hiring
  created_at      TIMESTAMP           NO Creation timestamp
  updated_at      TIMESTAMP          YES Last update

## company_agents

  Column          Type          Nullable Description
  --------------- ----------- ---------- ---------------------------------
  id              UUID                NO Primary key
  company_id      UUID                NO FK to companies
  agent_id        UUID                NO FK to agents
  name            VARCHAR            YES Agent name for this company
  status          VARCHAR            YES hired/active/paused
  hired_at        TIMESTAMP          YES Hiring timestamp
  created_at      TIMESTAMP           NO Creation timestamp
  updated_at      TIMESTAMP          YES Last update

## customers

  Column        Type          Nullable Description
  ------------- ----------- ---------- --------------------------
  id            UUID                NO Primary key
  company_id    UUID                NO FK to companies
  name          VARCHAR            YES Customer name
  phone         VARCHAR            YES Customer phone
  channel       VARCHAR            YES e.g. whatsapp
  created_at    TIMESTAMP           NO Creation timestamp
  updated_at    TIMESTAMP          YES Last update

## conversations

  Column                     Type          Nullable Description
  -------------------------- ----------- ---------- --------------------------
  id                         UUID                NO Primary key
  company_id                 UUID                NO FK to companies
  agent_id                   UUID               YES FK to agents
  customer_id                UUID                NO FK to customers
  channel                    VARCHAR            YES e.g. whatsapp
  open_ai_conversation_id    VARCHAR            YES OpenAI conversation ID, used to call the conversation via API
  status                     VARCHAR            YES active/closed/paused
  created_at                 TIMESTAMP           NO Creation timestamp
  updated_at                 TIMESTAMP          YES Last update

## products

  Column         Type              Nullable Description
  -------------- --------------- ---------- -----------------------
  id             UUID                    NO Primary key
  company_id     UUID                    NO FK to companies
  external_id    VARCHAR                YES External product ID
  sku            VARCHAR                YES Product SKU
  name           VARCHAR                YES Product name
  description    TEXT                   YES Product description
  price          DECIMAL(12,2)          YES Product price
  currency       VARCHAR(3)             YES Product currency
  image_url      TEXT                   YES Main image
  product_url    TEXT                   YES Product/checkout URL
  category       VARCHAR                YES Product category
  variants       JSONB                  YES Product variants
  attributes     JSONB                  YES Searchable attributes
  metadata       JSONB                  YES Extra product data
  is_active      BOOLEAN                NO Product active status
  created_at     TIMESTAMP               NO Creation timestamp
  updated_at     TIMESTAMP              YES Last update
