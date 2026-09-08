import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { buildProductEmbeddingInput, createProductEmbeddingsBatch } from "@/lib/products/embeddings";
import { validatePriceCurrency } from "@/lib/products/validation";
import {
  fetchAllProducts,
  fetchShopInfo,
  numericId,
  refreshOfflineToken,
  ShopifyReauthRequiredError,
  type ShopifyProduct,
} from "./admin-api";

// Pulls a connected store's whole catalogue into the `products` table:
// upsert by (company_id, external_id), then deactivate anything previously
// synced that this run didn't see. Triggered only by the merchant's
// "Sync now" button (no cron, no product webhooks in v1).
//
// Always runs through the service-role client -- `products` writes here
// aren't in a merchant request context, and it must filter company_id
// itself (same contract as ProductRepository). A caller may inject its own
// client so an integration test can point the whole thing at local Supabase.

const EXTERNAL_ID_PREFIX = "shopify:";

export type ShopifySyncResult = {
  synced: number;
  deactivated: number;
  skipped: { title: string; reason: string }[];
  truncated: boolean;
};

export class ShopifyNotConnectedError extends Error {
  constructor() {
    super("No connected Shopify store for this company");
    this.name = "ShopifyNotConnectedError";
  }
}

export { ShopifyReauthRequiredError } from "./admin-api";

// Shopify offline tokens now expire after ~1h. Refresh when the stored one
// is already past (or within a minute of) expiry, then persist the new
// access + refresh token (Shopify rotates the refresh token every time).
const TOKEN_REFRESH_SKEW_MS = 60_000;

async function resolveAccessToken(
  client: SupabaseClient,
  companyId: string,
  connection: { shop_domain: string; access_token: string; refresh_token: string | null; token_expires_at: string | null },
): Promise<string> {
  const expiresAt = connection.token_expires_at ? Date.parse(connection.token_expires_at) : null;
  const stillValid = expiresAt !== null && expiresAt - Date.now() > TOKEN_REFRESH_SKEW_MS;
  if (stillValid) return connection.access_token;

  // Expired (or a legacy non-expiring token Shopify no longer accepts).
  // Either way we can only recover with a refresh token.
  if (!connection.refresh_token) throw new ShopifyReauthRequiredError();

  const refreshed = await refreshOfflineToken(connection.shop_domain, connection.refresh_token);
  const { error } = await client
    .from("company_shopify_connections")
    .update({
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken ?? connection.refresh_token,
      token_expires_at: refreshed.expiresAt,
    })
    .eq("company_id", companyId);
  if (error) throw error;
  return refreshed.accessToken;
}

type MappedRow = {
  company_id: string;
  external_id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | null;
  currency: string | null;
  sku: string | null;
  stock: null;
  image_url: string | null;
  product_url: string | null;
  is_active: boolean;
  metadata: {
    source: "shopify";
    shopify_product_id: string;
    handle: string;
    sync_run: string;
  };
};

// Shopify descriptions are HTML. Strip tags + decode the handful of
// entities that actually show up, collapse whitespace -- enough to make it
// good embedding/grounding text, not a full sanitizer (the value is never
// rendered as HTML anywhere).
function stripHtml(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function mapProduct(
  product: ShopifyProduct,
  shop: string,
  currency: string,
  runId: string,
  companyId: string,
): MappedRow {
  const variant = product.variants.nodes[0];
  const rawPrice = variant?.price;
  const price =
    rawPrice != null && rawPrice !== "" && Number.isFinite(Number(rawPrice)) ? Number(rawPrice) : null;
  const productId = numericId(product.id);

  return {
    company_id: companyId,
    external_id: `${EXTERNAL_ID_PREFIX}${productId}`,
    name: product.title?.trim() ?? "",
    description: stripHtml(product.descriptionHtml),
    category: product.productType?.trim() || null,
    price,
    // Shopify prices are always in the shop currency; the payload never
    // repeats it, so it's stamped from the shop here (only when there's a
    // price -- a currency with no price fails validatePriceCurrency).
    currency: price != null ? currency : null,
    sku: variant?.sku?.trim() || null,
    // Decision: stock is not synced from Shopify in v1.
    stock: null,
    image_url: product.featuredImage?.url ?? null,
    product_url: product.onlineStoreUrl ?? `https://${shop}/products/${product.handle}`,
    // DRAFT / ARCHIVED products come across as inactive -- they exist, but
    // Malu must never recommend them.
    is_active: product.status === "ACTIVE",
    metadata: {
      source: "shopify",
      shopify_product_id: productId,
      handle: product.handle,
      sync_run: runId,
    },
  };
}

export async function syncShopifyCatalog({
  companyId,
  supabase,
}: {
  companyId: string;
  supabase?: SupabaseClient;
}): Promise<ShopifySyncResult> {
  const client = supabase ?? createServiceClient();
  const runId = randomUUID();

  const { data: connection, error: connError } = await client
    .from("company_shopify_connections")
    .select("shop_domain, access_token, refresh_token, token_expires_at, status")
    .eq("company_id", companyId)
    .maybeSingle();

  if (connError) throw connError;
  if (!connection || connection.status !== "connected" || !connection.access_token) {
    throw new ShopifyNotConnectedError();
  }

  const shop = connection.shop_domain as string;
  const accessToken = await resolveAccessToken(client, companyId, connection);

  const { currency } = await fetchShopInfo(shop, accessToken);
  const { products, truncated } = await fetchAllProducts(shop, accessToken);

  const skipped: { title: string; reason: string }[] = [];
  const rows: MappedRow[] = [];

  for (const product of products) {
    const row = mapProduct(product, shop, currency, runId, companyId);
    if (!row.name) {
      skipped.push({ title: product.title ?? product.handle ?? "(untitled)", reason: "name is required" });
      continue;
    }
    const priceError = validatePriceCurrency(row.price, row.currency);
    if (priceError) {
      skipped.push({ title: row.name, reason: priceError });
      continue;
    }
    rows.push(row);
  }

  // Re-embed only rows whose embedding-relevant text (name/category/
  // description) is new or changed since the last sync -- same principle as
  // the product PATCH route. A manual re-sync of an unchanged catalogue
  // then makes zero OpenAI calls. Existing shopify rows are read by prefix
  // rather than a (possibly huge) `.in(external_id, [...])` list.
  const { data: existingRows, error: existingError } = await client
    .from("products")
    .select("external_id, name, description, category")
    .eq("company_id", companyId)
    .like("external_id", `${EXTERNAL_ID_PREFIX}%`);
  if (existingError) throw existingError;

  const existingByExternalId = new Map(
    (existingRows ?? []).map((r) => [r.external_id as string, r]),
  );

  const changedRowIndexes: number[] = [];
  rows.forEach((row, index) => {
    const prev = existingByExternalId.get(row.external_id);
    const unchanged =
      prev &&
      prev.name === row.name &&
      (prev.description ?? null) === row.description &&
      (prev.category ?? null) === row.category;
    if (!unchanged) changedRowIndexes.push(index);
  });

  const embeddings = changedRowIndexes.length
    ? await createProductEmbeddingsBatch(
        changedRowIndexes.map((i) =>
          buildProductEmbeddingInput({
            name: rows[i].name,
            category: rows[i].category,
            description: rows[i].description,
          }),
        ),
      )
    : [];
  const embeddingSlotByRow = new Map(changedRowIndexes.map((rowIndex, slot) => [rowIndex, slot]));

  const payload = rows.map((row, index) => {
    const slot = embeddingSlotByRow.get(index);
    // Unchanged row: omit `embedding` entirely so the upsert leaves the
    // stored vector alone.
    if (slot === undefined) return row;
    return { ...row, embedding: embeddings[slot] ?? null };
  });

  if (payload.length > 0) {
    const { error: upsertError } = await client
      .from("products")
      .upsert(payload, { onConflict: "company_id,external_id" });
    if (upsertError) throw upsertError;
  }

  // Deactivate anything previously synced from Shopify that this run didn't
  // write (its metadata.sync_run is an older value). The stamp is O(1) in
  // catalogue size -- no NOT IN (huge list). A product Shopify still
  // returns but that failed mapping (bad price) is treated as absent and
  // deactivated; it reactivates on the next sync once fixed in Shopify.
  const { data: deactivatedRows, error: deactivateError } = await client
    .from("products")
    .update({ is_active: false })
    .eq("company_id", companyId)
    .like("external_id", `${EXTERNAL_ID_PREFIX}%`)
    .eq("is_active", true)
    .neq("metadata->>sync_run", runId)
    .select("id");
  if (deactivateError) throw deactivateError;

  await client
    .from("company_shopify_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("company_id", companyId);

  return {
    synced: payload.length,
    deactivated: deactivatedRows?.length ?? 0,
    skipped,
    truncated,
  };
}
