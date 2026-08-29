import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Trello H1 — update/soft-delete a single service. Mirrors B3's
// products/[productId] route exactly (effective-merged-state price
// validation, soft-delete via is_active, 404 on cross-company access).

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

async function getService(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  serviceId: string,
) {
  const { data: service, error } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (!service) {
    return { error: NextResponse.json({ error: "Service not found" }, { status: 404 }) };
  }

  return { service, error: null };
}

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

function validateBuffer(buffer: unknown): string | null {
  if (typeof buffer !== "number" || !Number.isInteger(buffer) || buffer < 0) {
    return "buffer_minutes must be a non-negative integer";
  }
  return null;
}

const OPTIONAL_PASSTHROUGH_FIELDS = [
  "description",
  "price",
  "currency",
  "category",
  "metadata",
] as const;

// PATCH: partial update. Only fields present in the body are changed.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ companyId: string; serviceId: string }> },
) {
  const { companyId, serviceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const serviceLookup = await getService(supabase, companyId, serviceId);
  if (serviceLookup.error) return serviceLookup.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    update.name = name;
  }

  if ("is_active" in body) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "is_active must be a boolean" }, { status: 400 });
    }
    update.is_active = body.is_active;
  }

  if ("duration_minutes" in body) {
    const durationError = validateDuration(body.duration_minutes);
    if (durationError) {
      return NextResponse.json({ error: durationError }, { status: 400 });
    }
    update.duration_minutes = body.duration_minutes;
  }

  if ("buffer_minutes" in body) {
    const bufferError = validateBuffer(body.buffer_minutes);
    if (bufferError) {
      return NextResponse.json({ error: bufferError }, { status: 400 });
    }
    update.buffer_minutes = body.buffer_minutes;
  }

  for (const field of OPTIONAL_PASSTHROUGH_FIELDS) {
    if (field in body) update[field] = body[field];
  }

  const effectivePrice = "price" in update ? update.price : serviceLookup.service.price;
  const effectiveCurrency = "currency" in update ? update.currency : serviceLookup.service.currency;
  const priceError = validatePriceCurrency(effectivePrice, effectiveCurrency);
  if (priceError) {
    return NextResponse.json({ error: priceError }, { status: 400 });
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ service: serviceLookup.service });
  }

  const { data, error } = await supabase
    .from("services")
    .update(update)
    .eq("id", serviceId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ service: data });
}

// DELETE: soft-delete. Sets is_active = false — appointments referencing
// this service_id keep resolving (on delete set null only fires on a real
// row deletion, which this never does).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; serviceId: string }> },
) {
  const { companyId, serviceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const serviceLookup = await getService(supabase, companyId, serviceId);
  if (serviceLookup.error) return serviceLookup.error;

  const { data, error } = await supabase
    .from("services")
    .update({ is_active: false })
    .eq("id", serviceId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ service: data });
}
