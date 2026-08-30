-- Trello M1 -- the web chat embed's domain-allowlist. Deny-by-default: an
-- empty list blocks the embed everywhere until the merchant adds at least
-- one domain (see decisions.md). Company-wide, not per-agent -- lives
-- alongside business info in Settings (M7), not a per-agent channels
-- section.
alter table public.companies
  add column allowed_embed_domains text[] not null default '{}';
