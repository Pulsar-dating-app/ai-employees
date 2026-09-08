import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { buildProductEmbeddingInput, createProductEmbeddingsBatch } from "@/lib/products/embeddings";
import { validatePriceCurrency } from "@/lib/products/validation";
import {
  downloadBulkProducts,
  fetchChangedProducts,
  fetchShopInfo,
  getBulkOperation,
  numericId,
  refreshOfflineToken,
  startBulkProductsExport,
  ShopifyReauthRequiredError,
  type ShopifyProduct,
} from "./admin-api";

// Pulls a connected store's catalogue into the `products` table (upsert by
// (company_id, external_id)). Triggered only by the merchant's "Sync now"
// button -- no cron, no product webhooks.
//
// Two modes:
//  * FULL -- GraphQL Bulk Operations (async on Shopify's side, JSONL file,
//    no product-count ceiling). Runs on the first sync ever, on an explicit
//    "full re-sync", and to resume an in-flight bulk op. Deactivates rows
//    the export didn't contain (source of truth).
//  * DELTA -- every sync after the first: a paginated `updated_at:>` query,
//    small and fast. Upsert only; deletions are reconciled by a full re-sync.
//
// Always runs through the service-role client -- `products` writes here
// aren't in a merchant request context, and it filters company_id itself
// (same contract as ProductRepository). A caller may inject its own client
// so an integration test can point the whole thing at local Supabase.

const EXTERNAL_ID_PREFIX = "shopify:";

// A bulk op can outlast one serverless request. Poll for at most this long,
// then hand back status:"running" and let a follow-up "Sync now" resume.
// Overridable so the integration suite can exercise the running path fast.
const BULK_POLL_BUDGET_MS = Number(process.env.SHOPIFY_BULK_POLL_BUDGET_MS ?? 210_000);
const BULK_POLL_INTERVAL_MS = Number(process.env.SHOPIFY_BULK_POLL_INTERVAL_MS ?? 2_000);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type ShopifySyncResult = {
  mode: "full" | "delta";
  // "completed" -- the import ran. "running" -- a bulk export is still going
  // on Shopify's side; click Sync again to pick up the result.
  status: "completed" | "running";
  synced: number;
  deactivated: number;
  skipped: { title: string; reason: string }[];
  truncated: boolean;
};

export class ShopifyBulkFailedError extends Error {
  constructor(detail: string) {
    super(`Shopify bulk export failed: ${detail}`);
    this.name = "ShopifyBulkFailedError";
  }
}

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

// Maps + validates a batch of Shopify products, re-embeds only the rows
// whose name/category/description changed since last time (same principle
// as the product PATCH route -- an unchanged re-sync makes zero OpenAI
// calls), and bulk-upserts. Shared by both sync modes.
async function applyProducts(
  client: SupabaseClient,
  companyId: string,
  shop: string,
  currency: string,
  runId: string,
  products: ShopifyProduct[],
): Promise<{ synced: number; skipped: { title: string; reason: string }[] }> {
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

  if (rows.length === 0) return { synced: 0, skipped };

  // Existing shopify rows read by prefix (an indexed (company_id,
  // external_id) range scan) rather than a possibly-huge .in([...]) list.
  const { data: existingRows, error: existingError } = await client
    .from("products")
    .select("external_id, name, description, category")
    .eq("company_id", companyId)
    .like("external_id", `${EXTERNAL_ID_PREFIX}%`);
  if (existingError) throw existingError;

  const existingByExternalId = new Map((existingRows ?? []).map((r) => [r.external_id as string, r]));

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
    // Unchanged row: omit `embedding` so the upsert leaves the stored vector alone.
    if (slot === undefined) return row;
    return { ...row, embedding: embeddings[slot] ?? null };
  });

  const { error: upsertError } = await client
    .from("products")
    .upsert(payload, { onConflict: "company_id,external_id" });
  if (upsertError) throw upsertError;

  return { synced: payload.length, skipped };
}

export async function syncShopifyCatalog({
  companyId,
  supabase,
  full = false,
}: {
  companyId: string;
  supabase?: SupabaseClient;
  // Force a bulk full re-sync even when a delta watermark exists -- how a
  // merchant reconciles products deleted in Shopify (delta can't see those).
  full?: boolean;
}): Promise<ShopifySyncResult> {
  const client = supabase ?? createServiceClient();
  const runId = randomUUID();

  const { data: connection, error: connError } = await client
    .from("company_shopify_connections")
    .select(
      "shop_domain, access_token, refresh_token, token_expires_at, status, last_synced_at, bulk_sync_op_id",
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (connError) throw connError;
  if (!connection || connection.status !== "connected" || !connection.access_token) {
    throw new ShopifyNotConnectedError();
  }

  const shop = connection.shop_domain as string;
  const accessToken = await resolveAccessToken(client, companyId, connection);
  const { currency } = await fetchShopInfo(shop, accessToken);

  // Resume an in-flight bulk op regardless of `full`; otherwise a delta once
  // there's a watermark; otherwise the first full export.
  const resumeBulk = Boolean(connection.bulk_sync_op_id);
  const useDelta = !full && !resumeBulk && Boolean(connection.last_synced_at);

  if (useDelta) {
    const { products, truncated } = await fetchChangedProducts(
      shop,
      accessToken,
      connection.last_synced_at as string,
    );
    const { synced, skipped } = await applyProducts(client, companyId, shop, currency, runId, products);
    await client
      .from("company_shopify_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("company_id", companyId);
    return { mode: "delta", status: "completed", synced, deactivated: 0, skipped, truncated };
  }

  // --- full export via Bulk Operations ------------------------------------
  let opId = connection.bulk_sync_op_id as string | null;
  if (!opId) {
    opId = await startBulkProductsExport(shop, accessToken);
    await client
      .from("company_shopify_connections")
      .update({ bulk_sync_op_id: opId })
      .eq("company_id", companyId);
  }

  const deadline = Date.now() + BULK_POLL_BUDGET_MS;
  let op = await getBulkOperation(shop, accessToken, opId);
  while (op && (op.status === "CREATED" || op.status === "RUNNING") && Date.now() < deadline) {
    await sleep(BULK_POLL_INTERVAL_MS);
    op = await getBulkOperation(shop, accessToken, opId);
  }

  if (!op || op.status === "FAILED" || op.status === "CANCELED" || op.status === "EXPIRED") {
    await client
      .from("company_shopify_connections")
      .update({ bulk_sync_op_id: null })
      .eq("company_id", companyId);
    throw new ShopifyBulkFailedError(op?.status ?? "operation not found");
  }

  if (op.status === "CREATED" || op.status === "RUNNING" || op.status === "CANCELING") {
    // Still going -- keep bulk_sync_op_id so the next "Sync now" resumes.
    return { mode: "full", status: "running", synced: 0, deactivated: 0, skipped: [], truncated: false };
  }

  // COMPLETED. `url` is null when the export matched zero products.
  const products = op.url ? await downloadBulkProducts(op.url) : [];
  const { synced, skipped } = await applyProducts(client, companyId, shop, currency, runId, products);

  // Full export is the source of truth: deactivate any shopify row this run
  // didn't write (its metadata.sync_run is stale). O(1) in catalogue size.
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
    .update({ bulk_sync_op_id: null, last_synced_at: new Date().toISOString() })
    .eq("company_id", companyId);

  return {
    mode: "full",
    status: "completed",
    synced,
    deactivated: deactivatedRows?.length ?? 0,
    skipped,
    truncated: false,
  };
}
