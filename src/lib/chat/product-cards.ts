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
// WEB_CHAT_PRODUCT_CARD_GUIDANCE in agent-engine/prompt.ts) -- the two must
// stay in step, since the model is told to search for exactly what it wants
// shown.
export const MAX_PRODUCT_CARDS = 4;

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
// The default is everything the turn searched for, capped -- the web-chat
// prompt tells the model that a search's results *are* what gets displayed
// and to search for exactly what it wants shown, so search result and card
// list are one decision rather than two that can disagree.
//
// The exception is a reply that explicitly names a subset of them ("a
// Hidden está disponível"), which narrows to those and orders them the way
// the sentence does. That layer exists because the contract above is a
// prompt instruction, not a guarantee: when the model searches broadly and
// then narrows in prose, the prose wins.
//
// Returns [] when no chosen product has an image. A row of name-and-price
// cards duplicating the text the customer just read adds nothing -- the
// picture is the entire reason this feature exists.
export function selectProductCards(
  toolCalls: readonly ToolCallLike[],
  responseText: string,
): SearchedProduct[] {
  const searched = collectSearchedProducts(toolCalls);
  if (searched.length === 0) return [];

  const haystack = normalize(responseText);
  const named = haystack ? searched.filter((product) => mentions(haystack, product.name)) : [];

  const chosen =
    named.length > 0
      ? [...named].sort((a, b) => haystack.indexOf(normalize(a.name)) - haystack.indexOf(normalize(b.name)))
      : searched;

  const capped = chosen.slice(0, MAX_PRODUCT_CARDS);
  if (!capped.some((product) => product.image_url)) return [];
  return capped;
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
