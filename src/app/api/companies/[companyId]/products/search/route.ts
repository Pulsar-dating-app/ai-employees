import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ProductRepository } from "@/lib/products/repository";

// Trello ticket B5 -- thin HTTP entry point over ProductRepository. C3's
// search_products/get_product tools (not built yet) will call
// ProductRepository directly in-process from the agent engine, not through
// this route -- this exists so the repository can be validated the same way
// as every other feature here, over real HTTP against real Supabase (see
// tests/integration/product-search.test.ts), since no direct-import test
// harness exists for service-role code in this repo's test setup.
//
// ProductRepository always uses the service-role client (bypasses RLS --
// see its own file comment for why), so this route must enforce company
// membership itself before calling it, the same reasoning as D1's routes
// that touch the service client.

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

function parseNumberParam(raw: string | null, field: string): { value?: number; error?: string } {
  if (raw === null) return {};
  const value = Number(raw);
  if (Number.isNaN(value)) return { error: `${field} must be a number` };
  return { value };
}

// GET: with ?productId=, looks up that single product (ProductRepository.get)
// and wraps it as a one-or-zero-element list. Otherwise runs a filtered,
// relevance-ranked search (ProductRepository.search) over ?text=/&keywords=
// (repeatable -- ?keywords=a&keywords=b -- matches ANY of them, unlike
// ?text= whose words are all required)/&category=/&priceMin=/&priceMax=/
// &attributes= (JSON-encoded object)/&limit=.
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

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  try {
    if (productId) {
      const product = await ProductRepository.get(companyId, productId);
      return NextResponse.json({ products: product ? [product] : [] });
    }

    const priceMin = parseNumberParam(url.searchParams.get("priceMin"), "priceMin");
    if (priceMin.error) return NextResponse.json({ error: priceMin.error }, { status: 400 });

    const priceMax = parseNumberParam(url.searchParams.get("priceMax"), "priceMax");
    if (priceMax.error) return NextResponse.json({ error: priceMax.error }, { status: 400 });

    const limit = parseNumberParam(url.searchParams.get("limit"), "limit");
    if (limit.error) return NextResponse.json({ error: limit.error }, { status: 400 });

    const attributesRaw = url.searchParams.get("attributes");
    let attributes: Record<string, unknown> | undefined;
    if (attributesRaw !== null) {
      try {
        attributes = JSON.parse(attributesRaw);
      } catch {
        return NextResponse.json({ error: "attributes must be valid JSON" }, { status: 400 });
      }
    }

    const keywords = url.searchParams.getAll("keywords");

    const products = await ProductRepository.search({
      companyId,
      text: url.searchParams.get("text") ?? undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
      category: url.searchParams.get("category") ?? undefined,
      priceMin: priceMin.value,
      priceMax: priceMax.value,
      attributes,
      limit: limit.value,
    });

    return NextResponse.json({ products });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
