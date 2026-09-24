import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  syncAppointmentConfirmed,
  syncAppointmentRescheduled,
  syncAppointmentCancelled,
  calendarVisibleEndsAt,
} from "@/lib/google-calendar/appointment-sync";
import { notifyAppointmentConfirmed, notifyAppointmentDeclined } from "@/lib/email/appointments";
import { notifyWaitlistForFreedSlot } from "@/lib/appointments/waitlist";
import { isValidTimeZone } from "@/lib/analytics/load";
import {
  fitsProfessionalSchedule,
  getProfessional,
  resolveProfessionalForService,
} from "@/lib/professionals/repository";

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
//
// 2026-09-24 -- `professional_id` in the body moves the appointment to
// another professional's schedule (validated like a reschedule: they must
// perform the service and the time must fit their hours/time off). Its
// Google event moves from the old professional's calendar to the new one's.

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
type SyncedAppointmentEvent = {
  id: string;
  professional_id: string;
  google_event_id: string;
  google_calendar_id: string | null;
};

async function cancelGoogleEventAndClear(
  supabase: Awaited<ReturnType<typeof createClient>>,
  appointment: SyncedAppointmentEvent,
) {
  await syncAppointmentCancelled(
    appointment.professional_id,
    appointment.google_event_id,
    appointment.google_calendar_id,
  );
  const { data: synced } = await supabase
    .from("appointments")
    .update({ google_event_id: null, google_calendar_id: null })
    .eq("id", appointment.id)
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
  // client, same "always server-computed" rule as creation. Hoisted so the
  // Google-sync branch below (outside this block) can compute the calendar
  // event's visible end without a second services fetch.
  let rescheduledDurationMinutes: number | null = null;
  const current = appointmentLookup.appointment;
  if ("starts_at" in body || "service_id" in body || "professional_id" in body) {
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
    rescheduledDurationMinutes = service.duration_minutes;

    const startsAtRaw = "starts_at" in body ? body.starts_at : appointmentLookup.appointment.starts_at;
    const startsAt = typeof startsAtRaw === "string" ? new Date(startsAtRaw) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      return NextResponse.json({ error: "starts_at must be a valid ISO datetime string" }, { status: 400 });
    }

    // Whose schedule: a new professional (or a new service) must be an
    // active professional who performs the service; otherwise the current
    // professional stays, even if the merchant later restricted the service.
    const professionalChanged =
      "professional_id" in body && body.professional_id !== current.professional_id;
    let professional;
    if (professionalChanged || "service_id" in body) {
      const targetId = professionalChanged ? body.professional_id : current.professional_id;
      if (typeof targetId !== "string" || !targetId) {
        return NextResponse.json({ error: "professional_id must be a non-empty string" }, { status: 400 });
      }
      const resolved = await resolveProfessionalForService(supabase, companyId, targetId, effectiveServiceId);
      if (!resolved.ok) {
        return NextResponse.json(
          {
            error:
              resolved.reason === "professional_not_found"
                ? "professional not found for this company"
                : "this professional doesn't perform this service",
          },
          { status: 400 },
        );
      }
      professional = resolved.professional;
    } else {
      professional = await getProfessional(supabase, companyId, current.professional_id as string);
      if (!professional) {
        return NextResponse.json({ error: "professional not found for this company" }, { status: 400 });
      }
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("timezone")
      .eq("id", companyId)
      .single();
    if (companyError) {
      return NextResponse.json({ error: companyError.message }, { status: 500 });
    }
    const timezone = company.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";

    // Same H3 gap fix as the create route: the new time must fit the
    // professional's hours (enforced once any are configured) and must not
    // fall in time off that applies to them.
    const fits = await fitsProfessionalSchedule(supabase, companyId, professional, {
      timezone,
      startsAt: startsAt.toISOString(),
      durationMinutes: service.duration_minutes,
    });
    if (!fits) {
      return NextResponse.json({ error: "This time is outside business hours" }, { status: 400 });
    }

    update.professional_id = professional.id;
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

  const preUpdateGoogleEventId = current.google_event_id as string | null;
  const preUpdateStatus = current.status as string;
  const rescheduled = "starts_at" in body || "service_id" in body || "professional_id" in body;
  const movedProfessional = data.professional_id !== current.professional_id;
  const preUpdateEvent: SyncedAppointmentEvent | null = preUpdateGoogleEventId
    ? {
        id: appointmentId,
        professional_id: current.professional_id as string,
        google_event_id: preUpdateGoogleEventId,
        google_calendar_id: (current.google_calendar_id as string | null) ?? null,
      }
    : null;

  // Trello R3 -- email the customer when the merchant acts on a pending
  // request (K7): approving it sends a confirmation, declining it (status
  // -> cancelled while it was still `requested`) sends a short "couldn't be
  // confirmed" note. Best-effort, before the Google-sync branching since
  // some of those paths return early. A confirm at *creation* time is
  // emailed by AppointmentRepository.book, not here.
  if (preUpdateStatus === "requested" && update.status === "confirmed") {
    await notifyAppointmentConfirmed(supabase, appointmentId);
  } else if (preUpdateStatus === "requested" && update.status === "cancelled") {
    await notifyAppointmentDeclined(supabase, appointmentId);
  }

  // Trello R5 -- a cancel here (merchant cancelling, or declining a pending
  // request) frees the slot: notify the oldest matching waitlist entry.
  // Best-effort, before the Google-sync branches since those can return
  // early. Not on a reschedule -- the customer still holds a slot then.
  if (update.status === "cancelled" && preUpdateStatus !== "cancelled") {
    await notifyWaitlistForFreedSlot({
      supabase,
      companyId,
      serviceId: (data.service_id as string | null) ?? null,
      professionalId: data.professional_id as string,
      startsAt: data.starts_at as string,
    });
  }

  // Moving to another professional: the event leaves the old professional's
  // calendar; the "confirmed without an event" branch below then creates it
  // in the new one's.
  let eventAfterMove = preUpdateGoogleEventId;
  if (preUpdateEvent && movedProfessional && update.status !== "cancelled") {
    await cancelGoogleEventAndClear(supabase, preUpdateEvent);
    eventAfterMove = null;
  }

  if (update.status === "cancelled" && preUpdateEvent) {
    const synced = await cancelGoogleEventAndClear(supabase, preUpdateEvent);
    if (synced) return NextResponse.json({ appointment: synced });
  } else if (
    !eventAfterMove &&
    (update.status === "confirmed" || (movedProfessional && data.status === "confirmed"))
  ) {
    const [{ data: service }, { data: customer }] = await Promise.all([
      supabase.from("services").select("name, duration_minutes").eq("id", data.service_id).maybeSingle(),
      supabase.from("customers").select("name").eq("id", data.customer_id).maybeSingle(),
    ]);
    if (service && customer) {
      const googleEvent = await syncAppointmentConfirmed(data.professional_id as string, {
        serviceName: service.name,
        customerName:
          customer.name ??
          (data.intake_answers as Record<string, string> | null)?.full_name ??
          "",
        startsAt: data.starts_at,
        visibleEndsAt: calendarVisibleEndsAt(data.starts_at, service.duration_minutes),
        // Ana's recap, captured at booking time (K-epic summary work).
        summary: data.summary as string | null,
      });
      if (googleEvent) {
        const { data: synced } = await supabase
          .from("appointments")
          .update({ google_event_id: googleEvent.googleEventId, google_calendar_id: googleEvent.googleCalendarId })
          .eq("id", appointmentId)
          .select()
          .single();
        if (synced) return NextResponse.json({ appointment: synced });
      }
    }
  } else if (preUpdateGoogleEventId && rescheduled && update.status !== "cancelled") {
    // rescheduledDurationMinutes is always set here: `rescheduled` is true
    // only when the block above (which sets it) ran.
    await syncAppointmentRescheduled(
      data.professional_id as string,
      preUpdateGoogleEventId,
      (current.google_calendar_id as string | null) ?? null,
      {
        startsAt: data.starts_at,
        visibleEndsAt: calendarVisibleEndsAt(data.starts_at, rescheduledDurationMinutes!),
      },
    );
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

  // Trello R5 -- freed a slot (unless it was already cancelled): notify the
  // oldest matching waitlist entry. Best-effort, before the Google-sync
  // branch since that can return early.
  if (appointmentLookup.appointment.status !== "cancelled") {
    await notifyWaitlistForFreedSlot({
      supabase,
      companyId,
      serviceId: (data.service_id as string | null) ?? null,
      professionalId: data.professional_id as string,
      startsAt: data.starts_at as string,
    });
  }

  const preUpdateGoogleEventId = appointmentLookup.appointment.google_event_id as string | null;
  if (preUpdateGoogleEventId) {
    const synced = await cancelGoogleEventAndClear(supabase, {
      id: appointmentId,
      professional_id: appointmentLookup.appointment.professional_id as string,
      google_event_id: preUpdateGoogleEventId,
      google_calendar_id: (appointmentLookup.appointment.google_calendar_id as string | null) ?? null,
    });
    if (synced) return NextResponse.json({ appointment: synced });
  }

  return NextResponse.json({ appointment: data });
}
