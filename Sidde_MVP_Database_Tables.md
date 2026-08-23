# Sidde MVP --- Database Tables

## users

  Column          Type          Nullable Description
  --------------- ----------- ---------- --------------------
  id              UUID                NO Primary key
  email           VARCHAR             NO User email
  password_hash   VARCHAR            YES Hashed password
  name            VARCHAR            YES User name
  created_at      TIMESTAMP           NO Creation timestamp
  updated_at      TIMESTAMP          YES Last update

## companies ------------------ TODO: Adicionar os knowledges da empresa aqui e deletar a tabela de knowledges

  Column        Type           Nullable Description
  ------------- ------------ ---------- ----------------------
  id            UUID                 NO Primary key
  name          VARCHAR             YES Business/store name
  email         VARCHAR             YES Business email
  phone         VARCHAR             YES Business phone
  website_url   VARCHAR             YES Website
  description   TEXT                YES Business description
  currency      VARCHAR(3)          YES Default currency
  country       VARCHAR             YES Country
  timezone      VARCHAR             YES Timezone
  created_at    TIMESTAMP            NO Creation timestamp
  updated_at    TIMESTAMP           YES Last update

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
  slug            VARCHAR             NO Internal identifier, e.g. malu
  name            VARCHAR            YES Agent name
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
  status          VARCHAR            YES hired/active/paused
  configuration   JSONB              YES Merchant-specific configuration
  hired_at        TIMESTAMP          YES Hiring timestamp
  created_at      TIMESTAMP           NO Creation timestamp
  updated_at      TIMESTAMP          YES Last update

## customers

  Column        Type          Nullable Description
  ------------- ----------- ---------- --------------------------
  id            UUID                NO Primary key
  company_id    UUID                NO FK to companies
  external_id   VARCHAR            YES Customer ID from channel
  name          VARCHAR            YES Customer name
  phone         VARCHAR            YES Customer phone
  email         VARCHAR            YES Customer email
  channel       VARCHAR            YES e.g. whatsapp
  metadata      JSONB              YES Extra customer data
  created_at    TIMESTAMP           NO Creation timestamp
  updated_at    TIMESTAMP          YES Last update

## conversations

  Column            Type          Nullable Description
  ----------------- ----------- ---------- --------------------------
  id                UUID                NO Primary key
  company_id        UUID                NO FK to companies
  agent_id          UUID               YES FK to agents
  customer_id       UUID                NO FK to customers
  channel           VARCHAR            YES e.g. whatsapp
  external_id       VARCHAR            YES External conversation ID
  status            VARCHAR            YES active/closed/paused
  summary           TEXT               YES Conversation summary
  last_message_at   TIMESTAMP          YES Last message timestamp
  metadata          JSONB              YES Extra conversation data
  created_at        TIMESTAMP           NO Creation timestamp
  updated_at        TIMESTAMP          YES Last update

## messages

  Column            Type          Nullable Description
  ----------------- ----------- ---------- --------------------------------
  id                UUID                NO Primary key
  conversation_id   UUID                NO FK to conversations
  customer_id       UUID               YES FK to customers
  agent_id          UUID               YES FK to agents
  role              VARCHAR             NO customer/assistant/system/tool
  content           TEXT               YES Message content
  external_id       VARCHAR            YES External message ID
  channel           VARCHAR            YES Message channel
  metadata          JSONB              YES Extra message data
  created_at        TIMESTAMP           NO Creation timestamp

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
  stock          DECIMAL(12,2)          YES Stock if available
  availability   VARCHAR                YES Availability status
  variants       JSONB                  YES Product variants
  attributes     JSONB                  YES Searchable attributes
  metadata       JSONB                  YES Extra product data
  is_active      BOOLEAN                YES Product active status
  created_at     TIMESTAMP               NO Creation timestamp
  updated_at     TIMESTAMP              YES Last update

## knowledge_items

  ------------------------------------------------------------------------------------------------------
  Column           Type                          Nullable Description
  ---------------- ---------------- --------------------- ----------------------------------------------
  id               UUID                                NO Primary key

  company_id       UUID                                NO FK to companies

  category         VARCHAR                            YES business/shipping/returns/payments/faq/other

  title            VARCHAR                            YES Knowledge title

  content          TEXT                               YES Knowledge content

  source           VARCHAR                            YES manual/import/etc.

  metadata         JSONB                              YES Extra information

  is_active        BOOLEAN                            YES Knowledge active status

  created_at       TIMESTAMP                           NO Creation timestamp

  updated_at       TIMESTAMP                          YES Last update
  ------------------------------------------------------------------------------------------------------

## knowledge_chunks -- Provavelmente remover

  Column              Type          Nullable Description
  ------------------- ----------- ---------- ---------------------------
  id                  UUID                NO Primary key
  knowledge_item_id   UUID                NO FK to knowledge_items
  content             TEXT               YES Chunk content
  embedding           VECTOR             YES Semantic-search embedding
  metadata            JSONB              YES Extra chunk data
  created_at          TIMESTAMP           NO Creation timestamp
  updated_at          TIMESTAMP          YES Last update

## product_embeddings -- Ver o que é isso

  Column       Type          Nullable Description
  ------------ ----------- ---------- -------------------------
  id           UUID                NO Primary key
  product_id   UUID                NO FK to products
  content      TEXT               YES Text used for embedding
  embedding    VECTOR             YES Product embedding
  metadata     JSONB              YES Extra embedding data
  created_at   TIMESTAMP           NO Creation timestamp
  updated_at   TIMESTAMP          YES Last update

## events -- Ver o que é isso

  Column            Type          Nullable Description
  ----------------- ----------- ---------- ---------------------
  id                UUID                NO Primary key
  company_id        UUID                NO FK to companies
  agent_id          UUID               YES FK to agents
  customer_id       UUID               YES FK to customers
  conversation_id   UUID               YES FK to conversations
  product_id        UUID               YES FK to products
  type              VARCHAR             NO Event type
  metadata          JSONB              YES Event-specific data
  created_at        TIMESTAMP           NO Event timestamp

## checkout_clicks -- REMOVER, fazemos dps

  Column            Type          Nullable Description
  ----------------- ----------- ---------- ----------------------------
  id                UUID                NO Primary key
  company_id        UUID                NO FK to companies
  agent_id          UUID               YES FK to agents
  customer_id       UUID               YES FK to customers
  conversation_id   UUID               YES FK to conversations
  product_id        UUID               YES FK to products
  tracking_id       VARCHAR             NO Public tracking identifier
  destination_url   TEXT               YES Merchant destination
  clicked_at        TIMESTAMP          YES Click timestamp
  metadata          JSONB              YES Extra click data
  created_at        TIMESTAMP           NO Creation timestamp

## whatsapp_connections -- Ver se precisa ou nao, pq as infos ja tao na customer table

  Column                Type          Nullable Description
  --------------------- ----------- ---------- ------------------------------
  id                    UUID                NO Primary key
  company_id            UUID                NO FK to companies
  phone_number          VARCHAR            YES Connected WhatsApp number
  phone_number_id       VARCHAR            YES Provider phone number ID
  business_account_id   VARCHAR            YES WhatsApp Business Account ID
  access_token          TEXT               YES Encrypted provider token
  status                VARCHAR            YES connected/disconnected/error
  metadata              JSONB              YES Provider data
  created_at            TIMESTAMP           NO Creation timestamp
  updated_at            TIMESTAMP          YES Last update

## product_imports -- Ver se precisa 

  Column            Type          Nullable Description
  ----------------- ----------- ---------- -------------------------------------
  id                UUID                NO Primary key
  company_id        UUID                NO FK to companies
  file_name         VARCHAR            YES Uploaded file
  file_type         VARCHAR            YES CSV/XLSX
  status            VARCHAR            YES pending/processing/completed/failed
  total_rows        INTEGER            YES Total rows
  successful_rows   INTEGER            YES Successful rows
  failed_rows       INTEGER            YES Failed rows
  errors            JSONB              YES Import errors
  created_at        TIMESTAMP           NO Creation timestamp
  updated_at        TIMESTAMP          YES Last update
  completed_at      TIMESTAMP          YES Completion timestamp
