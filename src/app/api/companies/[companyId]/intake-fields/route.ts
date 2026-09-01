import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Trello K8 — appointment_intake_fields: the customer details a merchant
// wants collected before a booking. Like business-hours (H2), this is a
// per-company settings list, not a paginated collection: GET returns the
// whole set in display order; PUT replaces it wholesale (delete-then-insert),
// with `position` assigned from array order so the client never has to send
// it. Member-level, matching every other scheduling route.

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

const MAX_FIELDS = 30;
const MAX_LABEL_LENGTH = 120;

type IntakeFieldInput = { label: string; is_required: boolean };

// Validates the whole incoming array up front — every row valid or nothing
// is written (same "reject before touching the DB" style as business-hours).
function validateIntakeFields(
  value: unknown,
): { rows: IntakeFieldInput[] } | { error: string } {
  if (!Array.isArray(value)) {
    return { error: "intakeFields must be an array" };
  }
  if (value.length > MAX_FIELDS) {
    return { error: `intakeFields can't have more than ${MAX_FIELDS} entries` };
  }

  const rows: IntakeFieldInput[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") {
      return { error: "each intake field must be an object" };
    }
    const row = entry as Record<string, unknown>;

    if (typeof row.label !== "string" || row.label.trim() === "") {
      return { error: "label must be a non-empty string" };
    }
    if (row.label.trim().length > MAX_LABEL_LENGTH) {
      return { error: `label must be ${MAX_LABEL_LENGTH} characters or fewer` };
    }
    if ("is_required" in row && typeof row.is_required !== "boolean") {
      return { error: "is_required must be a boolean" };
    }

    rows.push({
      label: row.label.trim(),
      is_required: (row.is_required as boolean | undefined) ?? false,
    });
  }

  return { rows };
}

// GET: the company's intake fields, in display order.
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
    .from("appointment_intake_fields")
    .select("id, label, is_required, position")
    .eq("company_id", companyId)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ intakeFields: data });
}

// PUT: replace the entire set. Not a transaction (supabase-js has no
// client-side multi-statement transaction — same limitation and same
// acceptable delete/insert window as business-hours' PUT, for a
// low-frequency per-company settings write).
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
  const validated = validateIntakeFields(body?.intakeFields);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("appointment_intake_fields")
    .delete()
    .eq("company_id", companyId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (validated.rows.length === 0) {
    return NextResponse.json({ intakeFields: [] });
  }

  const { data, error: insertError } = await supabase
    .from("appointment_intake_fields")
    .insert(
      validated.rows.map((row, index) => ({
        company_id: companyId,
        label: row.label,
        is_required: row.is_required,
        position: index,
      })),
    )
    .select("id, label, is_required, position")
    .order("position", { ascending: true });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ intakeFields: data });
}
