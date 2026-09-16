-- The first session's proof step is a rehearsal, not a shift: the merchant
-- talks to their hire as if they were a customer, and nothing that happens
-- there may reach the rest of the product. Booking tools are swapped for
-- no-ops in code (agent-engine/tools/rehearsal.ts), and this flag is what
-- keeps the conversation itself out of the inbox and out of the numbers.
--
-- Not a channel value: `conversation_channel` describes where a real customer
-- reached the business, and a rehearsal reached it from nowhere. A boolean
-- keeps every existing channel query working untouched.
alter table public.conversations
  add column is_preview boolean not null default false;

comment on column public.conversations.is_preview is
  'True for the first session''s proof-step conversation (src/app/api/companies/[companyId]/agents/[agentSlug]/preview-chat). Excluded from the Conversations inbox and from every analytics count -- a merchant rehearsing with their own hire is not a customer conversation, and counting it would inflate the one panel that exists to be trusted. Set only by the preview route; no other writer.';

create index conversations_company_not_preview_idx
  on public.conversations (company_id, updated_at desc)
  where not is_preview;
