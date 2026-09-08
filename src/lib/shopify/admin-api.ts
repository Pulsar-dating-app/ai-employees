import { resolveCheckoutBaseUrl } from "@/lib/checkout/links";

// Shopify Admin API calls for the catalogue connection. A sibling of
// src/lib/instagram/meta-instagram-api.ts, same shape: config pulled from
// env at module load, a base-URL override so integration tests can point
// every call at one local mock instead of the real per-shop hosts.
//
// SHOPIFY_API_KEY / SHOPIFY_API_SECRET are the app's OAuth client id +
// secret (Dev Dashboard > the app > Client credentials); the secret also
// signs the OAuth callback `hmac` and every webhook (see hmac.ts).
//
// The read path is the GraphQL Admin API, not REST: Shopify restricts new
// public apps' access to the REST product endpoints, and GraphQL is the
// supported surface going forward.

const API_KEY = process.env.SHOPIFY_API_KEY;
const API_SECRET = process.env.SHOPIFY_API_SECRET;
const SCOPES = process.env.SHOPIFY_SCOPES ?? "read_products";
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2026-07";

// Hard ceiling on a single synchronous sync, mirroring the CSV import's
// MAX_ROWS = 2000 philosophy. A catalogue larger than this is truncated
// (and the sync result says so) -- a queued/background sync is future work.
export const SHOPIFY_SYNC_MAX_PRODUCTS = Number(process.env.SHOPIFY_SYNC_MAX_PRODUCTS ?? 5000);

const PAGE_SIZE = 250; // Shopify's per-page maximum for a products connection.

// Real deployments hit `https://<shop>.myshopify.com`; a test points every
// call at one mock server via SHOPIFY_ADMIN_API_BASE_URL (only the path
// matters to the mock, same as INSTAGRAM_API_BASE_URL).
function adminApiBase(shop: string): string {
  return process.env.SHOPIFY_ADMIN_API_BASE_URL ?? `https://${shop}`;
}

export type ShopifyProduct = {
  id: string; // GID, e.g. "gid://shopify/Product/123"
  handle: string;
  title: string;
  descriptionHtml: string | null;
  productType: string | null;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  onlineStoreUrl: string | null;
  featuredImage: { url: string } | null;
  variants: { nodes: { price: string | null; sku: string | null }[] };
};

// "gid://shopify/Product/123" -> "123". Falls back to the raw value if the
// shape is ever different, so external_id is always populated.
export function numericId(gid: string): string {
  const match = /\/(\d+)(?:\?.*)?$/.exec(gid);
  return match ? match[1] : gid;
}

// Trim, drop a scheme/path/query if the merchant pasted a full URL,
// lowercase, and require the canonical `<name>.myshopify.com` shape. Returns
// null on anything else -- the caller turns that into a 400, never a guess.
export function normalizeShopDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/\/.*$/, "");
  value = value.replace(/\s+/g, "");
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value) ? value : null;
}

// One shared redirect URI for every company (state carries which one) --
// so it only has to be registered once in the app config. Reuses
// resolveCheckoutBaseUrl(), the same "this app's own https origin" resolver
// the Instagram callback uses.
export function shopifyCallbackUrl(): string {
  return `${resolveCheckoutBaseUrl()}/dashboard/shopify-callback`;
}

// Step 1: the authorize URL the merchant is redirected to. Always the real
// `https://<shop>` host -- this is a browser redirect to Shopify, not a
// server call, so the test base-URL override does not apply here.
// `grant_options[]=` (empty, i.e. not "per-user") asks for an offline token;
// `expiring=1` on the code exchange (step 2) then makes it a 1-hour token
// with a 90-day refresh token -- Shopify stopped accepting non-expiring
// offline tokens for the Admin API.
export function buildAuthorizeUrl(shop: string, state: string): string {
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", API_KEY!);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("redirect_uri", shopifyCallbackUrl());
  url.searchParams.set("state", state);
  url.searchParams.set("grant_options[]", "");
  return url.toString();
}

export type ShopifyOfflineToken = {
  accessToken: string;
  scope: string;
  refreshToken: string | null;
  // ISO timestamp the access token expires at, or null if Shopify still
  // issued a non-expiring one (older stores / before enforcement).
  expiresAt: string | null;
};

// Thrown when the refresh token itself is terminal (expired, revoked,
// replayed, or the app was uninstalled) -- the merchant has to reconnect.
export class ShopifyReauthRequiredError extends Error {
  constructor(message = "Shopify connection needs to be reconnected") {
    super(message);
    this.name = "ShopifyReauthRequiredError";
  }
}

function tokenBody(json: {
  access_token?: string;
  scope?: string;
  refresh_token?: string;
  expires_in?: number;
}): ShopifyOfflineToken {
  if (!json.access_token) throw new Error("Shopify token response had no access_token");
  return {
    accessToken: json.access_token,
    scope: json.scope ?? SCOPES,
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null,
  };
}

// Step 2: authorization code -> expiring offline token (+ refresh token).
export async function exchangeCodeForToken(shop: string, code: string): Promise<ShopifyOfflineToken> {
  const res = await fetch(`${adminApiBase(shop)}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: API_KEY,
      client_secret: API_SECRET,
      code,
      // Non-expiring offline tokens are no longer accepted by the Admin API.
      expiring: "1",
    }),
  });
  if (!res.ok) throw new Error(`Shopify token exchange failed: ${res.status} ${await res.text()}`);
  return tokenBody((await res.json()) as Parameters<typeof tokenBody>[0]);
}

// Exchanges a stored refresh token for a fresh access token. Shopify
// returns a NEW refresh token every time -- the caller must persist both.
export async function refreshOfflineToken(
  shop: string,
  refreshToken: string,
): Promise<ShopifyOfflineToken> {
  const res = await fetch(`${adminApiBase(shop)}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: API_KEY,
      client_secret: API_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  // 401 => the refresh token is terminal; anything else non-2xx is transient.
  if (res.status === 401) throw new ShopifyReauthRequiredError();
  if (!res.ok) throw new Error(`Shopify token refresh failed: ${res.status} ${await res.text()}`);
  return tokenBody((await res.json()) as Parameters<typeof tokenBody>[0]);
}

async function shopifyGraphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${adminApiBase(shop)}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });
  if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors || !json.data) {
    throw new Error(`Shopify GraphQL returned errors: ${JSON.stringify(json.errors ?? "no data")}`);
  }
  return json.data;
}

// The store's display name + currency, read once per sync. Shopify product
// prices are always in the shop currency and the product payload never
// repeats it, so this is where synced rows get their `currency`.
export async function fetchShopInfo(
  shop: string,
  accessToken: string,
): Promise<{ name: string; currency: string }> {
  const data = await shopifyGraphql<{ shop: { name: string; currencyCode: string } }>(
    shop,
    accessToken,
    `query { shop { name currencyCode } }`,
  );
  return { name: data.shop.name, currency: data.shop.currencyCode };
}

// Registers the app/uninstalled webhook so a merchant removing the app
// tears down the connection (compliance webhooks -- customers/data_request
// etc. -- can only be set in the app config, not via API, so they're not
// here). Best-effort: the caller ignores failures (already-registered, or
// Shopify rejecting a non-https callback in local dev).
export async function registerAppUninstalledWebhook(shop: string, accessToken: string): Promise<void> {
  const mutation = `
    mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
        userErrors { message }
      }
    }
  `;
  await shopifyGraphql(shop, accessToken, mutation, {
    topic: "APP_UNINSTALLED",
    sub: { callbackUrl: `${resolveCheckoutBaseUrl()}/api/webhooks/shopify`, format: "JSON" },
  });
}

// --- delta read (paginated, filtered by updated_at) ------------------------
//
// Every sync after the first only pulls products changed since the last
// one, so this stays small and fits a single serverless request even for a
// huge catalogue. Deletions can't be seen this way -- a "full re-sync"
// (bulk) reconciles those.

const CHANGED_PRODUCTS_QUERY = `
  query ChangedProducts($cursor: String, $q: String!) {
    products(first: ${PAGE_SIZE}, after: $cursor, query: $q) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        descriptionHtml
        productType
        status
        onlineStoreUrl
        featuredImage { url }
        variants(first: 1) { nodes { price sku } }
      }
    }
  }
`;

type ProductsPage = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: ShopifyProduct[];
  };
};

export async function fetchChangedProducts(
  shop: string,
  accessToken: string,
  sinceIso: string,
): Promise<{ products: ShopifyProduct[]; truncated: boolean }> {
  const products: ShopifyProduct[] = [];
  let cursor: string | null = null;
  let truncated = false;
  const q = `updated_at:>${sinceIso}`;

  for (;;) {
    const data: ProductsPage = await shopifyGraphql<ProductsPage>(
      shop,
      accessToken,
      CHANGED_PRODUCTS_QUERY,
      { cursor, q },
    );
    products.push(...data.products.nodes);

    if (products.length >= SHOPIFY_SYNC_MAX_PRODUCTS) {
      products.length = SHOPIFY_SYNC_MAX_PRODUCTS;
      truncated = data.products.pageInfo.hasNextPage;
      break;
    }
    if (!data.products.pageInfo.hasNextPage || !data.products.pageInfo.endCursor) break;
    cursor = data.products.pageInfo.endCursor;
  }

  return { products, truncated };
}

// --- full read (GraphQL Bulk Operations) ----------------------------------
//
// The Bulk Operations API runs a query async on Shopify's side and writes
// every matching object to a JSONL file -- no pagination, no per-page rate
// limit, no product-count ceiling. Used for the first sync and an explicit
// full re-sync. A bulk op can outlast one serverless request, so the id is
// persisted and a follow-up "Sync now" resumes it.
//
// Bulk query rules: nested connections take no arguments (so `variants`,
// not `variants(first: 1)`), and every connection is `edges { node }`.
// Nested connection items come back as their own JSONL lines carrying a
// `__parentId`; a parent line always precedes its children.

const BULK_PRODUCTS_QUERY = `
{
  products {
    edges {
      node {
        id
        handle
        title
        descriptionHtml
        productType
        status
        onlineStoreUrl
        featuredImage { url }
        variants { edges { node { id price sku } } }
      }
    }
  }
}`;

export type BulkOperationState = {
  id: string;
  status: "CREATED" | "RUNNING" | "COMPLETED" | "CANCELING" | "CANCELED" | "FAILED" | "EXPIRED";
  url: string | null;
  objectCount: number;
};

async function currentBulkOperation(shop: string, accessToken: string): Promise<BulkOperationState | null> {
  const data = await shopifyGraphql<{ currentBulkOperation: BulkOperationState | null }>(
    shop,
    accessToken,
    `query { currentBulkOperation(type: QUERY) { id status url objectCount } }`,
  );
  return data.currentBulkOperation;
}

export async function getBulkOperation(
  shop: string,
  accessToken: string,
  opId: string,
): Promise<BulkOperationState | null> {
  const data = await shopifyGraphql<{ node: BulkOperationState | null }>(
    shop,
    accessToken,
    `query($id: ID!) { node(id: $id) { ... on BulkOperation { id status url objectCount } } }`,
    { id: opId },
  );
  return data.node;
}

async function cancelBulkOperation(shop: string, accessToken: string, opId: string): Promise<void> {
  await shopifyGraphql(
    shop,
    accessToken,
    `mutation($id: ID!) { bulkOperationCancel(id: $id) { userErrors { message } } }`,
    { id: opId },
  );
}

// Submits the products bulk export and returns the operation id. Only one
// bulk QUERY op can run per app+shop, so a stale/running one is cancelled
// first.
export async function startBulkProductsExport(shop: string, accessToken: string): Promise<string> {
  const running = await currentBulkOperation(shop, accessToken);
  if (running && (running.status === "CREATED" || running.status === "RUNNING")) {
    await cancelBulkOperation(shop, accessToken, running.id);
  }

  const data = await shopifyGraphql<{
    bulkOperationRunQuery: {
      bulkOperation: { id: string; status: string } | null;
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(
    shop,
    accessToken,
    `mutation($q: String!) {
       bulkOperationRunQuery(query: $q) {
         bulkOperation { id status }
         userErrors { field message }
       }
     }`,
    { q: BULK_PRODUCTS_QUERY },
  );

  const { bulkOperation, userErrors } = data.bulkOperationRunQuery;
  if (bulkOperation?.id) return bulkOperation.id;

  // Race: another request already started one between our check and submit.
  if (userErrors.some((e) => /already in progress/i.test(e.message))) {
    const current = await currentBulkOperation(shop, accessToken);
    if (current?.id) return current.id;
  }
  throw new Error(`Shopify bulk export failed: ${JSON.stringify(userErrors)}`);
}

type BulkProductLine = {
  id: string;
  __parentId?: string;
  handle?: string;
  title?: string;
  descriptionHtml?: string | null;
  productType?: string | null;
  status?: ShopifyProduct["status"];
  onlineStoreUrl?: string | null;
  featuredImage?: { url: string } | null;
  price?: string | null;
  sku?: string | null;
};

// Downloads a completed bulk op's JSONL and reassembles products, keeping
// only the first variant per product (no variant model).
export async function downloadBulkProducts(url: string): Promise<ShopifyProduct[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Shopify bulk result download failed: ${res.status}`);
  const text = await res.text();

  const byId = new Map<string, ShopifyProduct>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const obj = JSON.parse(line) as BulkProductLine;

    if (obj.__parentId && obj.id.includes("/ProductVariant/")) {
      const parent = byId.get(obj.__parentId);
      if (parent && parent.variants.nodes.length === 0) {
        parent.variants.nodes.push({ price: obj.price ?? null, sku: obj.sku ?? null });
      }
      continue;
    }
    if (obj.id.includes("/Product/")) {
      byId.set(obj.id, {
        id: obj.id,
        handle: obj.handle ?? "",
        title: obj.title ?? "",
        descriptionHtml: obj.descriptionHtml ?? null,
        productType: obj.productType ?? null,
        status: obj.status ?? "ACTIVE",
        onlineStoreUrl: obj.onlineStoreUrl ?? null,
        featuredImage: obj.featuredImage ?? null,
        variants: { nodes: [] },
      });
    }
  }
  return [...byId.values()];
}
