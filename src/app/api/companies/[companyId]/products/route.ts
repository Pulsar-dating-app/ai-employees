import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildProductEmbeddingInput, createProductEmbedding } from "@/lib/products/embeddings";
import { PRODUCT_PUBLIC_COLUMNS } from "@/lib/products/columns";
import { validatePriceCurrency, validateStock } from "@/lib/products/validation";
// Re-exported so Trello B4's import route (`from "../route"`) keeps its
// existing import path; the rules themselves now live in src/lib/products
// so non-route callers (the Shopify catalogue sync) can share them.
export { validatePriceCurrency, validateStock };

// Trello ticket B3 — product catalog CRUD, scoped to company_id. RLS
// (is_company_member) already enforces this at the DB layer; the explicit
// membership check here exists to return a clean 403 instead of a raw
// Postgres error or an empty result, matching A3/B1's convention.

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

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// Lenient positive-integer parsing for pagination params — an invalid value
// silently falls back to the default rather than 400ing, matching
// includeInactive's own permissive "=== 'true'" string check below.
function parsePositiveInt(value: string | null, fallback: number, max?: number): number {
  const parsed = value === null ? NaN : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

// GET: list products for the company. Soft-deleted products (is_active =
// false) are excluded by default — pass ?includeInactive=true to see them.
// Trello F3 added category/search filters and pagination (?category=,
// ?search= matches name case-insensitively, ?page=/?pageSize=) — B3's own
// card asked for this on the list endpoint but it was never built; F3's UI
// is the first real consumer that needs it.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const searchParams = new URL(request.url).searchParams;
  const includeInactive = searchParams.get("includeInactive") === "true";
  const category = searchParams.get("category")?.trim() || null;
  const search = searchParams.get("search")?.trim() || null;
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  let query = supabase.from("products").select(PRODUCT_PUBLIC_COLUMNS, { count: "exact" }).eq("company_id", companyId);
  if (!includeInactive) {
    query = query.eq("is_active", true);
  }
  if (category) {
    query = query.eq("category", category);
  }
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ products: data, total: count ?? 0, page, pageSize });
}

// POST: create a product. name is required; price/currency must travel
// together. Everything else is optional passthrough.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const priceError = validatePriceCurrency(body?.price, body?.currency);
  if (priceError) {
    return NextResponse.json({ error: priceError }, { status: 400 });
  }

  const stockError = validateStock(body?.stock);
  if (stockError) {
    return NextResponse.json({ error: stockError }, { status: 400 });
  }

  // Hybrid search's semantic leg (Trello: pgvector, src/lib/products/embeddings.ts).
  // Generated before the insert -- not deferred to a background job, since
  // this app has no job runner -- so the product is searchable by meaning
  // from the moment it exists, never stale relative to what was just typed.
  // Never blocks the write: a failure (or the test-env kill switch) yields
  // null, and the row is simply searchable by keyword only until a later
  // edit fills it in.
  const embedding = await createProductEmbedding(
    buildProductEmbeddingInput({ name, category: body?.category, description: body?.description }),
  );

  const { data, error } = await supabase
    .from("products")
    .insert({
      company_id: companyId,
      name,
      external_id: body?.external_id ?? null,
      sku: body?.sku ?? null,
      description: body?.description ?? null,
      price: body?.price ?? null,
      currency: body?.currency ?? null,
      stock: body?.stock ?? null,
      image_url: body?.image_url ?? null,
      product_url: body?.product_url ?? null,
      category: body?.category ?? null,
      metadata: body?.metadata ?? null,
      embedding,
    })
    .select(PRODUCT_PUBLIC_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ product: data }, { status: 201 });
}
