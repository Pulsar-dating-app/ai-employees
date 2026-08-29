import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Trello H2 — business_hours: a recurring weekly template, not a paginated
// collection (a week has exactly 7 days, split shifts aside). GET returns
// the current set; PUT replaces the whole set at once — same whole-array-
// replace semantics as F2's FAQ section, just over a real table instead of
// a jsonb column, since availability needs indexed per-day rows (Trello I2).

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

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

type BusinessHourInput = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active?: boolean;
};

// Validates the whole incoming array up front — either every row is valid
// and gets written, or none are (matches products/services' "reject before
// touching the DB" style, just applied to a batch instead of one row).
function validateBusinessHours(value: unknown): { rows: BusinessHourInput[] } | { error: string } {
  if (!Array.isArray(value)) {
    return { error: "businessHours must be an array" };
  }

  const rows: BusinessHourInput[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") {
      return { error: "each business hours entry must be an object" };
    }
    const row = entry as Record<string, unknown>;

    if (typeof row.day_of_week !== "number" || !Number.isInteger(row.day_of_week) || row.day_of_week < 0 || row.day_of_week > 6) {
      return { error: "day_of_week must be an integer 0-6 (0 = Sunday)" };
    }
    if (typeof row.start_time !== "string" || !TIME_PATTERN.test(row.start_time)) {
      return { error: "start_time must be a HH:MM (or HH:MM:SS) string" };
    }
    if (typeof row.end_time !== "string" || !TIME_PATTERN.test(row.end_time)) {
      return { error: "end_time must be a HH:MM (or HH:MM:SS) string" };
    }
    if (row.end_time <= row.start_time) {
      return { error: "end_time must be after start_time" };
    }
    if ("is_active" in row && typeof row.is_active !== "boolean") {
      return { error: "is_active must be a boolean" };
    }

    rows.push({
      day_of_week: row.day_of_week,
      start_time: row.start_time,
      end_time: row.end_time,
      is_active: (row.is_active as boolean | undefined) ?? true,
    });
  }

  return { rows };
}

// GET: list the company's business hours, ordered for display.
export async function GET(
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

  const { data, error } = await supabase
    .from("business_hours")
    .select("*")
    .eq("company_id", companyId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ businessHours: data });
}

// PUT: replace the entire set. Not a transaction (supabase-js has no
// client-side multi-statement transaction, same limitation A3's company
// creation routed around with an RPC — not worth an RPC here for a single
// per-company settings screen with no concurrent-writer concern), so there
// is a small window between the delete and the insert; acceptable for a
// low-frequency settings write.
export async function PUT(
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
  const validated = validateBusinessHours(body?.businessHours);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("business_hours")
    .delete()
    .eq("company_id", companyId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (validated.rows.length === 0) {
    return NextResponse.json({ businessHours: [] });
  }

  const { data, error: insertError } = await supabase
    .from("business_hours")
    .insert(validated.rows.map((row) => ({ ...row, company_id: companyId })))
    .select();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ businessHours: data });
}
