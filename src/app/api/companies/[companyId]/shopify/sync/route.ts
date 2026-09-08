import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  syncShopifyCatalog,
  ShopifyNotConnectedError,
  ShopifyReauthRequiredError,
} from "@/lib/shopify/catalog-sync";
import { requireMember } from "../access";

// POST: pull the connected store's catalogue into `products`. Member-level
// (matches product create/edit, which the product routes also gate at
// requireMember, not requireAdmin) -- connect/disconnect stay admin-only.
export async function POST(
  _request: Request,
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

  try {
    const result = await syncShopifyCatalog({ companyId });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ShopifyNotConnectedError) {
      return NextResponse.json({ error: "not_connected" }, { status: 409 });
    }
    if (err instanceof ShopifyReauthRequiredError) {
      // The refresh token is terminal -- the merchant must reconnect.
      return NextResponse.json({ error: "reauth_required" }, { status: 409 });
    }
    // Anything else is a failed round trip to Shopify or a DB write --
    // never leak the raw text, log it server-side.
    console.error("Shopify catalogue sync failed", err);
    return NextResponse.json({ error: "sync_failed" }, { status: 502 });
  }
}
