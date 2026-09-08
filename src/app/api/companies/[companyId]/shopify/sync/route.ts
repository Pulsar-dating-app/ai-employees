import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  syncShopifyCatalog,
  ShopifyNotConnectedError,
  ShopifyReauthRequiredError,
  ShopifyBulkFailedError,
} from "@/lib/shopify/catalog-sync";
import { requireMember } from "../access";

// A full (bulk) sync polls Shopify while its async export runs. Give the
// function room; it hands back status:"running" before this is hit and a
// follow-up "Sync now" resumes. Needs a Vercel plan that allows it (Hobby
// caps at 10s -- the resume-on-next-click path still works, just slower).
export const maxDuration = 300;

// POST: pull the connected store's catalogue into `products`. Member-level
// (matches product create/edit, which the product routes also gate at
// requireMember, not requireAdmin) -- connect/disconnect stay admin-only.
// Body `{ full: true }` forces a bulk full re-sync (reconciles products
// deleted in Shopify, which a delta can't see).
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
  const full = body?.full === true;

  try {
    const result = await syncShopifyCatalog({ companyId, full });
    // Bulk export still running on Shopify's side -- 202, client re-polls.
    return NextResponse.json(result, { status: result.status === "running" ? 202 : 200 });
  } catch (err) {
    if (err instanceof ShopifyNotConnectedError) {
      return NextResponse.json({ error: "not_connected" }, { status: 409 });
    }
    if (err instanceof ShopifyReauthRequiredError) {
      // The refresh token is terminal -- the merchant must reconnect.
      return NextResponse.json({ error: "reauth_required" }, { status: 409 });
    }
    if (err instanceof ShopifyBulkFailedError) {
      return NextResponse.json({ error: "bulk_failed" }, { status: 502 });
    }
    // Anything else is a failed round trip to Shopify or a DB write --
    // never leak the raw text, log it server-side.
    console.error("Shopify catalogue sync failed", err);
    return NextResponse.json({ error: "sync_failed" }, { status: 502 });
  }
}
