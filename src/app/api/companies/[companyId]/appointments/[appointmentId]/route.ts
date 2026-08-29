import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  syncAppointmentConfirmed,
  syncAppointmentRescheduled,
  syncAppointmentCancelled,
} from "@/lib/google-calendar/appointment-sync";

// Trello H3 — update/cancel a single appointment. Reschedule (changing
// starts_at and/or service_id) is supported here for dashboard convenience
// even though Ana's own book_appointment tool (Trello J3) treats reschedule
// as cancel-then-rebook rather than a dedicated tool call — this is the
// general-purpose CRUD API, not limited to what one caller needs.
//
// Trello I3 — Google Calendar sync hooks in after the DB write succeeds,
// keyed off the appointment's *pre-update* google_event_id: cancelling an
// appointment that had one deletes the Google event; confirming one that
// didn't have one (a manual-approval appointment going requested ->
// confirmed) creates it; rescheduling one that already had one updates it.
// These three cases are mutually exclusive by construction. Best-effort —
// see appointment-sync.ts, a sync failure never fails the request.

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

async function getAppointment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  appointmentId: string,
) {
  const { data: appointment, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (!appointment) {
    return { error: NextResponse.json({ error: "Appointment not found" }, { status: 404 }) };
  }

  return { appointment, error: null };
}

// Shared by PATCH and DELETE: deletes the Google event for a
// newly-cancelled appointment and clears google_event_id. Returns the
// re-fetched row (with google_event_id nulled), or null if that follow-up
// update itself failed for some reason — callers fall back to their own
// already-fetched row in that case.
async function cancelGoogleEventAndClear(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  appointmentId: string,
  googleEventId: string,
) {
  await syncAppointmentCancelled(companyId, googleEventId);
  const { data: synced } = await supabase
    .from("appointments")
    .update({ google_event_id: null })
    .eq("id", appointmentId)
    .select()
    .single();
  return synced ?? null;
}

const VALID_STATUSES = ["requested", "confirmed", "cancelled", "completed", "no_show"] as const;

// PATCH: partial update. Only fields present in the body are changed.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ companyId: string; appointmentId: string }> },
) {
  const { companyId, appointmentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const appointmentLookup = await getAppointment(supabase, companyId, appointmentId);
  if (appointmentLookup.error) return appointmentLookup.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if ("status" in body) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    update.status = body.status;
  }

  if ("cancellation_reason" in body) {
    if (body.cancellation_reason !== null && typeof body.cancellation_reason !== "string") {
      return NextResponse.json({ error: "cancellation_reason must be a string or null" }, { status: 400 });
    }
    update.cancellation_reason = body.cancellation_reason;
  }

  if ("notes" in body) {
    if (body.notes !== null && typeof body.notes !== "string") {
      return NextResponse.json({ error: "notes must be a string or null" }, { status: 400 });
    }
    update.notes = body.notes;
  }

  // Reschedule: either starts_at or service_id (or both) changing means
  // ends_at has to be recomputed — never left stale, never trusted from the
  // client, same "always server-computed" rule as creation.
  if ("starts_at" in body || "service_id" in body) {
    const effectiveServiceId =
      "service_id" in body ? body.service_id : appointmentLookup.appointment.service_id;

    if (typeof effectiveServiceId !== "string" || !effectiveServiceId) {
      return NextResponse.json(
        { error: "service_id must be a non-empty string (appointment has no service to derive duration from)" },
        { status: 400 },
      );
    }

    const { data: service, error: serviceError } = await supabase
      .from("services")
      .select("id, duration_minutes, buffer_minutes")
      .eq("id", effectiveServiceId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (serviceError) {
      return NextResponse.json({ error: serviceError.message }, { status: 500 });
    }
    if (!service) {
      return NextResponse.json({ error: "service not found for this company" }, { status: 400 });
    }

    const startsAtRaw = "starts_at" in body ? body.starts_at : appointmentLookup.appointment.starts_at;
    const startsAt = typeof startsAtRaw === "string" ? new Date(startsAtRaw) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      return NextResponse.json({ error: "starts_at must be a valid ISO datetime string" }, { status: 400 });
    }

    update.service_id = effectiveServiceId;
    update.starts_at = startsAt.toISOString();
    update.ends_at = new Date(
      startsAt.getTime() + (service.duration_minutes + service.buffer_minutes) * 60_000,
    ).toISOString();
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ appointment: appointmentLookup.appointment });
  }

  const { data, error } = await supabase
    .from("appointments")
    .update(update)
    .eq("id", appointmentId)
    .select()
    .single();

  if (error) {
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "This time overlaps with an existing appointment" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const preUpdateGoogleEventId = appointmentLookup.appointment.google_event_id as string | null;
  const rescheduled = "starts_at" in body || "service_id" in body;

  if (update.status === "cancelled" && preUpdateGoogleEventId) {
    const synced = await cancelGoogleEventAndClear(supabase, companyId, appointmentId, preUpdateGoogleEventId);
    if (synced) return NextResponse.json({ appointment: synced });
  } else if (update.status === "confirmed" && !preUpdateGoogleEventId) {
    const [{ data: service }, { data: customer }] = await Promise.all([
      supabase.from("services").select("name").eq("id", data.service_id).maybeSingle(),
      supabase.from("customers").select("name").eq("id", data.customer_id).maybeSingle(),
    ]);
    if (service && customer) {
      const googleEventId = await syncAppointmentConfirmed(companyId, {
        serviceName: service.name,
        customerName: customer.name,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
      });
      if (googleEventId) {
        const { data: synced } = await supabase
          .from("appointments")
          .update({ google_event_id: googleEventId })
          .eq("id", appointmentId)
          .select()
          .single();
        if (synced) return NextResponse.json({ appointment: synced });
      }
    }
  } else if (preUpdateGoogleEventId && rescheduled && update.status !== "cancelled") {
    await syncAppointmentRescheduled(companyId, preUpdateGoogleEventId, {
      startsAt: data.starts_at,
      endsAt: data.ends_at,
    });
  }

  return NextResponse.json({ appointment: data });
}

// DELETE: quick cancel — sets status = 'cancelled' with no reason recorded.
// Use PATCH { status: "cancelled", cancellation_reason } for the richer
// path. Idempotent: cancelling an already-cancelled appointment is a no-op,
// not an error, matching products' soft-delete precedent. Never a hard
// DELETE — the row (and the exclusion constraint releasing its slot) stays.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; appointmentId: string }> },
) {
  const { companyId, appointmentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const appointmentLookup = await getAppointment(supabase, companyId, appointmentId);
  if (appointmentLookup.error) return appointmentLookup.error;

  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const preUpdateGoogleEventId = appointmentLookup.appointment.google_event_id as string | null;
  if (preUpdateGoogleEventId) {
    const synced = await cancelGoogleEventAndClear(supabase, companyId, appointmentId, preUpdateGoogleEventId);
    if (synced) return NextResponse.json({ appointment: synced });
  }

  return NextResponse.json({ appointment: data });
}
