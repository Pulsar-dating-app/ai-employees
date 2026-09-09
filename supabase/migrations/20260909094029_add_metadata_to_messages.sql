-- Product cards in the web chat.
--
-- Until now an agent reply was a plain string: `search_products` returned
-- full product rows (image_url included) and the Agent Engine handed them
-- back to the chat route as tool results, but the route persisted only
-- `responseText` and dropped the rest. A customer therefore read a list of
-- product names with no picture -- the one thing that makes a product
-- recognisable.
--
-- The rows have to be persisted, not re-derived on read: tool results live
-- only for the duration of the turn that produced them (the engine keeps
-- conversation memory OpenAI-side, and `events` records the mint, not the
-- card), so a visitor refreshing the page would otherwise lose every card
-- in their history while keeping the text that referred to it.
--
-- A single nullable jsonb rather than a message_products join table: the
-- payload is a denormalised *snapshot* of what the customer was actually
-- shown at that moment, deliberately NOT a live reference. A product that
-- is later renamed, repriced, or delisted must not silently rewrite what a
-- past reply appears to have said -- the same reasoning that makes `events`
-- and `messages` append-only in the first place. Nothing queries inside it,
-- so it needs no index.
--
-- Shape (versioned so a future card type can be added without guessing):
--   { "products": [ { "id", "name", "price", "currency", "imageUrl", "url" } ] }
-- `url` is a tracked /c/{trackingId} link, so a tap on a card counts as a
-- real checkout click exactly like a link Malu sends in text.

alter table public.messages
  add column metadata jsonb;

comment on column public.messages.metadata is
  'Denormalised snapshot of structured content rendered alongside this message '
  '(currently { products: [...] } for web-chat product cards). Never a live '
  'reference to the products table -- a later rename/reprice must not rewrite '
  'history. Append-only like the rest of the row.';
