import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Trello ticket A3 — the API surface other epics build against, no UI yet.

// GET: list-companies-for-current-user. RLS ("Company members can view
// their company") already scopes the result to companies the caller
// belongs to, so this is a plain select — no manual join needed.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase.from("companies").select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ companies: data });
}

// POST: create-company. Delegates to the create_company_with_owner RPC so
// the companies + company_users(role='owner') insert is one atomic call —
// supabase-js has no client-side multi-table transaction primitive.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_company_with_owner", {
    company_name: name,
    company_email: body?.email ?? null,
    company_phone: body?.phone ?? null,
    company_website_url: body?.website_url ?? null,
    company_description: body?.description ?? null,
    company_currency: body?.currency ?? null,
    company_country: body?.country ?? null,
    company_timezone: body?.timezone ?? null,
  });

  if (error) {
    // Logged, not just returned: a 500 out of this RPC was showing up as an
    // occasional CI failure with nothing anywhere naming the cause — the
    // test only saw a body without `company` in it. PostgREST puts the real
    // reason in code/details/hint, so print all of it.
    console.error("create_company_with_owner failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ company: data }, { status: 201 });
}
