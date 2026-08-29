import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Trello H1 — services CRUD, scoped to company_id. Deliberately mirrors B3's
// products routes shape (requireMember, price/currency pairing rule,
// includeInactive/category/search/pagination) rather than inventing a new
// pattern — services are "products, but the thing being sold is time."

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
      error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }),
    };
  }

  return { error: null };
}

// price and currency travel together, same rule as products.
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

function validateDuration(duration: unknown): string | null {
  if (typeof duration !== "number" || !Number.isInteger(duration) || duration <= 0) {
    return "duration_minutes must be a positive integer";
  }
  return null;
}

// buffer_minutes is nullable-ish in spirit (0 is the default/"no buffer"),
// but always present as a number once stored — same non-negative-integer
// style as products' stock, just never null.
function validateBuffer(buffer: unknown): string | null {
  if (buffer === undefined || buffer === null) return null;
  if (typeof buffer !== "number" || !Number.isInteger(buffer) || buffer < 0) {
    return "buffer_minutes must be a non-negative integer";
  }
  return null;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function parsePositiveInt(value: string | null, fallback: number, max?: number): number {
  const parsed = value === null ? NaN : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return max ? Math.min(parsed, max) : parsed;
}

// GET: list services for the company. Soft-deleted (is_active = false)
// services are excluded by default — pass ?includeInactive=true to include
// them. Same category/search/pagination shape as products' list endpoint.
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

  let query = supabase.from("services").select("*", { count: "exact" }).eq("company_id", companyId);
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

  return NextResponse.json({ services: data, total: count ?? 0, page, pageSize });
}

// POST: create a service. name/duration_minutes are required; price/currency
// must travel together. Everything else is optional passthrough.
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

  const durationError = validateDuration(body?.duration_minutes);
  if (durationError) {
    return NextResponse.json({ error: durationError }, { status: 400 });
  }

  const bufferError = validateBuffer(body?.buffer_minutes);
  if (bufferError) {
    return NextResponse.json({ error: bufferError }, { status: 400 });
  }

  const priceError = validatePriceCurrency(body?.price, body?.currency);
  if (priceError) {
    return NextResponse.json({ error: priceError }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("services")
    .insert({
      company_id: companyId,
      name,
      description: body?.description ?? null,
      duration_minutes: body.duration_minutes,
      buffer_minutes: body?.buffer_minutes ?? 0,
      price: body?.price ?? null,
      currency: body?.currency ?? null,
      category: body?.category ?? null,
      metadata: body?.metadata ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ service: data }, { status: 201 });
}
