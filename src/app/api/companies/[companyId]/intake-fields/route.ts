import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  PREDEFINED_INTAKE_FIELDS,
  PREDEFINED_INTAKE_KEYS,
  LOCKED_INTAKE_KEYS,
  slugifyIntakeLabel,
} from "@/lib/appointments/intake-fields";

// Trello K8 / R2 -- appointment_intake_fields: the customer details a
// merchant wants collected before a booking. Two kinds of row:
//   * predefined (key in PREDEFINED_INTAKE_KEYS) -- the fixed core set
//     (email / full_name / phone / cpf / date_of_birth). Fixed label +
//     field_type; the merchant only toggles is_enabled / is_required.
//     `email` and `full_name` are locked on+required (LOCKED_INTAKE_KEYS).
//   * custom -- free-text questions (field_type 'text'), added/removed/
//     reordered by the merchant, with a slug key generated from the label.
//
// GET returns every row (disabled predefined included, so the UI can show
// the toggles). PUT replaces the whole set wholesale, delete-then-insert
// like business-hours -- `position` and custom `key`s are assigned
// server-side. Member-level, matching the rest of the scheduling routes.

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

  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!membership) {
    return { error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }) };
  }
  return { error: null };
}

const MAX_CUSTOM_FIELDS = 25;
const MAX_LABEL_LENGTH = 120;

type PredefinedInput = { key: string; is_enabled: boolean; is_required: boolean };
type CustomInput = { label: string; is_required: boolean };

function validate(
  body: unknown,
): { predefined: PredefinedInput[]; custom: CustomInput[] } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  // predefined: optional; any key not sent keeps its current default.
  const predefinedByKey = new Map<string, PredefinedInput>();
  if (b.predefined !== undefined) {
    if (!Array.isArray(b.predefined)) return { error: "predefined must be an array" };
    for (const entry of b.predefined) {
      const row = (entry ?? {}) as Record<string, unknown>;
      if (typeof row.key !== "string" || !PREDEFINED_INTAKE_KEYS.has(row.key)) {
        return { error: `unknown predefined key: ${String(row.key)}` };
      }
      if (typeof row.is_enabled !== "boolean" || typeof row.is_required !== "boolean") {
        return { error: "predefined is_enabled / is_required must be booleans" };
      }
      if (LOCKED_INTAKE_KEYS.has(row.key) && (!row.is_enabled || !row.is_required)) {
        return { error: `${row.key} is always collected and always required` };
      }
      // A field that's off can't also be required.
      const required = row.is_enabled ? row.is_required : false;
      predefinedByKey.set(row.key, { key: row.key, is_enabled: row.is_enabled, is_required: required });
    }
  }
  const predefined: PredefinedInput[] = PREDEFINED_INTAKE_FIELDS.map(
    (f) =>
      predefinedByKey.get(f.key) ?? {
        key: f.key,
        is_enabled: f.defaultEnabled,
        is_required: f.defaultRequired,
      },
  );

  // custom: optional; defaults to empty.
  const custom: CustomInput[] = [];
  if (b.custom !== undefined) {
    if (!Array.isArray(b.custom)) return { error: "custom must be an array" };
    if (b.custom.length > MAX_CUSTOM_FIELDS) {
      return { error: `no more than ${MAX_CUSTOM_FIELDS} custom questions` };
    }
    for (const entry of b.custom) {
      const row = (entry ?? {}) as Record<string, unknown>;
      const label = typeof row.label === "string" ? row.label.trim() : "";
      if (label === "") return { error: "each custom question needs a label" };
      if (label.length > MAX_LABEL_LENGTH) {
        return { error: `label must be ${MAX_LABEL_LENGTH} characters or fewer` };
      }
      if ("is_required" in row && typeof row.is_required !== "boolean") {
        return { error: "custom is_required must be a boolean" };
      }
      custom.push({ label, is_required: (row.is_required as boolean | undefined) ?? true });
    }
  }

  return { predefined, custom };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const { data, error } = await supabase
    .from("appointment_intake_fields")
    .select("id, key, label, field_type, is_required, is_enabled, position")
    .eq("company_id", companyId)
    .order("position", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    intakeFields: (data ?? []).map((row) => ({
      ...row,
      predefined: PREDEFINED_INTAKE_KEYS.has(row.key as string),
    })),
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const validated = validate(await request.json().catch(() => null));
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("appointment_intake_fields")
    .delete()
    .eq("company_id", companyId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  // Predefined first (positions -5..-1, fixed label + field_type from code),
  // then custom (positions 0..n, slug keys deduped within this write).
  const rows: {
    company_id: string;
    key: string;
    label: string;
    field_type: string;
    is_required: boolean;
    is_enabled: boolean;
    position: number;
  }[] = [];

  PREDEFINED_INTAKE_FIELDS.forEach((field, i) => {
    const choice = validated.predefined.find((p) => p.key === field.key)!;
    rows.push({
      company_id: companyId,
      key: field.key,
      label: field.label,
      field_type: field.fieldType,
      is_required: choice.is_required,
      is_enabled: choice.is_enabled,
      position: i - PREDEFINED_INTAKE_FIELDS.length,
    });
  });

  const usedKeys = new Set(rows.map((r) => r.key));
  validated.custom.forEach((field, i) => {
    let key = slugifyIntakeLabel(field.label);
    let n = 1;
    while (usedKeys.has(key)) {
      n += 1;
      key = `${slugifyIntakeLabel(field.label)}_${n}`;
    }
    usedKeys.add(key);
    rows.push({
      company_id: companyId,
      key,
      label: field.label,
      field_type: "text",
      is_required: field.is_required,
      is_enabled: true,
      position: i,
    });
  });

  const { data, error: insertError } = await supabase
    .from("appointment_intake_fields")
    .insert(rows)
    .select("id, key, label, field_type, is_required, is_enabled, position")
    .order("position", { ascending: true });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({
    intakeFields: (data ?? []).map((row) => ({
      ...row,
      predefined: PREDEFINED_INTAKE_KEYS.has(row.key as string),
    })),
  });
}
