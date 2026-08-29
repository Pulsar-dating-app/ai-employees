import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildProductEmbeddingInput, createProductEmbedding } from "@/lib/products/embeddings";
import { PRODUCT_PUBLIC_COLUMNS } from "@/lib/products/columns";

// Trello ticket B3 — update/soft-delete a single product.

async function requireMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
) {
  const { data: membership, error } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (!membership) {
    return {
      error: NextResponse.json(
        { error: "Not a member of this company" },
        { status: 403 },
      ),
    };
  }

  return { error: null };
}

async function getProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  productId: string,
) {
  const { data: product, error } = await supabase
    .from("products")
    .select(PRODUCT_PUBLIC_COLUMNS)
    .eq("id", productId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (!product) {
    // Doesn't exist, or belongs to a different company — either way it's a
    // client error, not a platform config problem.
    return { error: NextResponse.json({ error: "Product not found" }, { status: 404 }) };
  }

  return { product, error: null };
}

// price and currency travel together: a price with no currency is
// meaningless money, a currency with no price is noise. Validated against
// the *effective* value after the update is applied, not just the fields
// present in this request — e.g. sending only `price` on a product that
// already has no `currency` must still fail.
function validatePriceCurrency(price: unknown, currency: unknown): string | null {
  if (price === undefined || price === null) return null;

  if (typeof price !== "number" || Number.isNaN(price) || price < 0) {
    return "price must be a number >= 0";
  }

  if (!currency) {
    return "currency is required when price is present";
  }

  return null;
}

// stock is nullable and unconstrained at the DB level (Trello B4 migration
// 20260826135937) — null means "not tracked," 0 means "out of stock." Same
// app-layer-only validation style as price, not a DB CHECK.
function validateStock(stock: unknown): string | null {
  if (stock === undefined || stock === null) return null;
  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
    return "stock must be a non-negative integer";
  }
  return null;
}

const OPTIONAL_PASSTHROUGH_FIELDS = [
  "external_id",
  "sku",
  "description",
  "price",
  "currency",
  "stock",
  "image_url",
  "product_url",
  "category",
  "variants",
  "attributes",
  "metadata",
] as const;

// PATCH: partial update. Only fields present in the body are changed.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ companyId: string; productId: string }> },
) {
  const { companyId, productId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const productLookup = await getProduct(supabase, companyId, productId);
  if (productLookup.error) return productLookup.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    update.name = name;
  }

  if ("is_active" in body) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "is_active must be a boolean" }, { status: 400 });
    }
    update.is_active = body.is_active;
  }

  for (const field of OPTIONAL_PASSTHROUGH_FIELDS) {
    if (field in body) update[field] = body[field];
  }

  const effectivePrice = "price" in update ? update.price : productLookup.product.price;
  const effectiveCurrency = "currency" in update ? update.currency : productLookup.product.currency;
  const priceError = validatePriceCurrency(effectivePrice, effectiveCurrency);
  if (priceError) {
    return NextResponse.json({ error: priceError }, { status: 400 });
  }

  if ("stock" in update) {
    const stockError = validateStock(update.stock);
    if (stockError) {
      return NextResponse.json({ error: stockError }, { status: 400 });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ product: productLookup.product });
  }

  // Only regenerate the embedding when a field that actually feeds it
  // changed -- editing price/stock/sku/etc is by far the most common PATCH
  // on this route (F3's product management UI), and re-embedding on every
  // one of those would be a real API call this update doesn't need. Uses
  // the *effective* value (post-update, falling back to what's already
  // stored) the same way price/currency validation above does, so clearing
  // just the description on an otherwise-unchanged product still re-embeds
  // with the new (shorter) text rather than the stale one.
  if ("name" in update || "description" in update || "category" in update) {
    const embedding = await createProductEmbedding(
      buildProductEmbeddingInput({
        name: "name" in update ? (update.name as string) : productLookup.product.name,
        category: "category" in update ? (update.category as string | null) : productLookup.product.category,
        description:
          "description" in update
            ? (update.description as string | null)
            : productLookup.product.description,
      }),
    );
    update.embedding = embedding;
  }

  const { data, error } = await supabase
    .from("products")
    .update(update)
    .eq("id", productId)
    .select(PRODUCT_PUBLIC_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ product: data });
}

// DELETE: soft-delete. Sets is_active = false rather than removing the row,
// so events/analytics referencing this product_id keep resolving — see the
// card's "recommends soft-delete over hard deletion" note.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; productId: string }> },
) {
  const { companyId, productId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const productLookup = await getProduct(supabase, companyId, productId);
  if (productLookup.error) return productLookup.error;

  const { data, error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", productId)
    .select(PRODUCT_PUBLIC_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ product: data });
}
