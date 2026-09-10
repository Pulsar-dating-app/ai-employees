// Turning a turn's `search_products` tool results into the product cards
// rendered under an agent reply on the web chat.
//
// Pure and side-effect free on purpose: the route does the minting and the
// persisting, this module only decides *which* products the reply is
// showing and what each card carries.

export type ProductCard = {
  id: string;
  name: string;
  // Short, already-truncated blurb shown under the name. Truncated here
  // rather than in CSS so the stored snapshot is the same length the
  // customer saw, and so a merchant's 2000-character Shopify description
  // never travels into a message row.
  description: string | null;
  // Normalised to a string: a numeric column arrives as a string over
  // PostgREST's REST interface but as a JSON number from an RPC, and
  // `search_products` is an RPC. Formatting stays the renderer's job.
  price: string | null;
  currency: string | null;
  imageUrl: string | null;
  // A tracked /c/{trackingId} URL, filled in by the caller after minting.
  // Null when the product has no product_url to redirect to, which is a
  // real state: the card still shows, it just isn't tappable.
  url: string | null;
};

export type MessageMetadata = { products: ProductCard[] };

type ToolCallLike = { name: string; result: unknown };

export type SearchedProduct = {
  id: string;
  name: string;
  description: string | null;
  price: string | null;
  currency: string | null;
  image_url: string | null;
  product_url: string | null;
};

// Four is what the agent prompt promises the model (see
// PRODUCT_CARD_GUIDANCE in agent-engine/prompt.ts) -- the two must stay in
// step, since the model is told to name at most four products it wants shown.
// It is also the tightest ceiling of the three surfaces: Instagram's
// generic template allows 10 elements and Telegram's media group 10 items,
// but four is what a phone screen reads as a list rather than a catalogue.
export const MAX_PRODUCT_CARDS = 4;

// The channels that can draw a product visually, each in its own format:
// HTML rows on the web chat, a generic-template carousel on Instagram, a
// media-group album on Telegram.
//
// WhatsApp is deliberately absent. Its single-message product format
// (Multi-Product Message) references products by `product_retailer_id` from
// a Meta Commerce catalogue, which this app does not sync -- the Shopify
// importer populates our own `products` table, not Meta's. Sending loose
// photos instead would mean one reply becoming N messages, so WhatsApp
// keeps the text-only reply it has always had until that catalogue sync
// exists. See decisions.md, 2026-09-09.
const CARD_RENDERING_CHANNELS = new Set(["web_chat", "instagram", "telegram"]);

export function channelRendersProductCards(channel: string | null | undefined): boolean {
  return typeof channel === "string" && CARD_RENDERING_CHANNELS.has(channel);
}

// Roughly two lines on a desktop card and three on a phone, where
// `line-clamp-2` takes over visually. Long enough to say what the product
// is, short enough that four cards still scan as a list.
export const MAX_CARD_DESCRIPTION_LENGTH = 120;

function truncate(text: string, limit: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= limit) return collapsed;
  // Cut at the last word boundary inside the limit so the ellipsis doesn't
  // land mid-word; fall back to a hard cut for a single very long token.
  const cut = collapsed.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function readDescription(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const truncated = truncate(value, MAX_CARD_DESCRIPTION_LENGTH);
  return truncated.length > 0 ? truncated : null;
}

// Accepts both shapes a Postgres numeric can arrive in (see ProductCard.price).
function readPrice(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function isSearchedProduct(value: unknown): value is { id: string; name: string } {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.name === "string" && row.name.trim().length > 0;
}

// Accent- and case-insensitive, whitespace-collapsed. A Portuguese catalogue
// and a model writing Portuguese prose disagree about accents often enough
// that a plain lowercase comparison misses real matches ("Camiseta Básica"
// written back as "camiseta basica").
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function mentions(haystack: string, productName: string): boolean {
  const needle = normalize(productName);
  if (needle.length < 3) return false;
  return haystack.includes(needle);
}

// Every product this turn's searches returned, de-duplicated by id and in
// first-seen order.
export function collectSearchedProducts(toolCalls: readonly ToolCallLike[]): SearchedProduct[] {
  const seen = new Map<string, SearchedProduct>();

  for (const call of toolCalls) {
    if (call.name !== "search_products" || !Array.isArray(call.result)) continue;
    for (const row of call.result) {
      if (!isSearchedProduct(row) || seen.has(row.id)) continue;
      const record = row as Record<string, unknown>;
      seen.set(row.id, {
        id: row.id,
        name: row.name,
        description: readDescription(record.description),
        price: readPrice(record.price),
        currency: typeof record.currency === "string" ? record.currency : null,
        image_url: typeof record.image_url === "string" ? record.image_url : null,
        product_url: typeof record.product_url === "string" ? record.product_url : null,
      });
    }
  }

  return [...seen.values()];
}

// Which products get a card.
//
// The model decides, explicitly (2026-09-10). Its structured reply carries
// `product_ids` -- the ids, from this turn's `search_products` results, it
// chose to show, in display order. `displayProductIds` is that list:
//   - a non-null array (incl. `[]`) is authoritative: show exactly those,
//     in that order, and nothing else. `[]` means "no cards", full stop.
//   - `null` means no parseable structured reply was produced (an older
//     model, an error, an in-process fake) -- only then does this fall back
//     to the legacy heuristic of carding the products the prose names.
//
// This replaced, in turn, "every searched product is shown" (a decline
// still got a contradicting card row) and "card whatever the prose names"
// (a product named only to rule it out still got carded). An id list is
// the only version the model can drive precisely for every case. See
// decisions.md.
//
// Returns [] when no chosen product has an image. A row of name-and-price
// cards duplicating the text the customer just read adds nothing -- the
// picture is the entire reason this feature exists.
export function selectProductCards(
  toolCalls: readonly ToolCallLike[],
  responseText: string,
  displayProductIds?: readonly string[] | null,
): SearchedProduct[] {
  const searched = collectSearchedProducts(toolCalls);
  if (searched.length === 0) return [];

  const chosen =
    displayProductIds != null
      ? pickByExplicitIds(searched, displayProductIds)
      : pickByNameMention(searched, responseText);

  const capped = chosen.slice(0, MAX_PRODUCT_CARDS);
  if (!capped.some((product) => product.image_url)) return [];
  return capped;
}

// The model's own ordered id list -> the matching searched products, in
// that order. An id that isn't in this turn's search results is dropped
// (the model can only card what it actually looked up -- same guard as the
// grounding rule), and duplicates collapse.
function pickByExplicitIds(
  searched: readonly SearchedProduct[],
  ids: readonly string[],
): SearchedProduct[] {
  const byId = new Map(searched.map((product) => [product.id, product]));
  const out: SearchedProduct[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const product = byId.get(id);
    if (product) out.push(product);
  }
  return out;
}

// Legacy fallback only (see selectProductCards): card the searched products
// whose catalog name appears in the reply, ordered as the sentence names
// them.
function pickByNameMention(searched: readonly SearchedProduct[], responseText: string): SearchedProduct[] {
  const haystack = normalize(responseText);
  if (!haystack) return [];
  const named = searched.filter((product) => mentions(haystack, product.name));
  return [...named].sort(
    (a, b) => haystack.indexOf(normalize(a.name)) - haystack.indexOf(normalize(b.name)),
  );
}

// Narrows whatever came back from `messages.metadata` (jsonb, so `unknown`
// as far as the client is concerned) into something renderable. Anything
// malformed reads as "no cards" rather than throwing -- a message row is
// history, and history must always render.
export function readMessageMetadata(value: unknown): MessageMetadata | null {
  if (typeof value !== "object" || value === null) return null;
  const products = (value as Record<string, unknown>).products;
  if (!Array.isArray(products)) return null;

  const cards = products.flatMap((entry): ProductCard[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const card = entry as Record<string, unknown>;
    if (typeof card.id !== "string" || typeof card.name !== "string") return [];
    return [
      {
        id: card.id,
        name: card.name,
        description: typeof card.description === "string" ? card.description : null,
        price: readPrice(card.price),
        currency: typeof card.currency === "string" ? card.currency : null,
        imageUrl: typeof card.imageUrl === "string" ? card.imageUrl : null,
        url: typeof card.url === "string" ? card.url : null,
      },
    ];
  });

  return cards.length > 0 ? { products: cards } : null;
}

// One price formatter for every surface, so the web card, the Instagram
// carousel subtitle and the Telegram caption can never disagree about how
// the same product's price reads.
//
// Currency is merchant data and can be missing or junk on a hand-imported
// row; Intl throws on an unknown code rather than degrading, so a bad value
// must never take the card down with it.
export function formatProductPrice(
  price: string | null,
  currency: string | null,
  locale: string,
): string | null {
  if (!price) return null;
  const amount = Number(price);
  if (!Number.isFinite(amount)) return null;

  if (currency) {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
    } catch {
      // Falls through to the plain number below.
    }
  }
  return new Intl.NumberFormat(locale).format(amount);
}

// The messaging channels have no UI locale to read: Instagram and Telegram
// replies are composed server-side for a customer whose language is only
// known from what they typed. Brazil-first, matching the product's own
// positioning and the language the reply itself is written in -- and note
// this formats the *currency the product is stored in*, so a USD product
// still reads as "US$ 749,95", not as reais.
const MESSAGING_PRICE_LOCALE = "pt-BR";

// What a card looks like once it leaves the database and becomes something
// Instagram or Telegram can carry: the price already rendered, no currency
// code to re-interpret downstream.
export type DeliverableProductCard = {
  name: string;
  description: string | null;
  priceLabel: string | null;
  imageUrl: string | null;
  url: string | null;
};

export function toDeliverableCards(products: readonly ProductCard[]): DeliverableProductCard[] {
  return products.map((product) => ({
    name: product.name,
    description: product.description,
    priceLabel: formatProductPrice(product.price, product.currency, MESSAGING_PRICE_LOCALE),
    imageUrl: product.imageUrl,
    url: product.url,
  }));
}
