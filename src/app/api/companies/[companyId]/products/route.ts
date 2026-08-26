import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

// price and currency travel together: a price with no currency is
// meaningless money, a currency with no price is noise. Either can be
// absent, but not one without the other.
// Exported for reuse by Trello B4's import route — the ticket explicitly
// wants row validation to reuse this rule, not duplicate it.
export function validatePriceCurrency(price: unknown, currency: unknown): string | null {
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
export function validateStock(stock: unknown): string | null {
  if (stock === undefined || stock === null) return null;
  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
    return "stock must be a non-negative integer";
  }
  return null;
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

  let query = supabase.from("products").select("*", { count: "exact" }).eq("company_id", companyId);
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
      variants: body?.variants ?? null,
      attributes: body?.attributes ?? null,
      metadata: body?.metadata ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ product: data }, { status: 201 });
}
