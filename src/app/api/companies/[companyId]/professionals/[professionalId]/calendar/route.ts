import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getValidAccessToken } from "@/lib/google-calendar/connection";
import { listWritableCalendars } from "@/lib/google-calendar/calendars";
import { requireProfessionalAccess } from "@/lib/professionals/route-auth";

// Trello I1, per professional since 2026-09-24 -- one professional's Google
// Calendar connection: status (GET), which calendar of the account holds
// their appointments (PATCH), and disconnect (DELETE). The connect step is
// ./connect (it needs the OAuth code exchange).
//
// access_token/refresh_token are column-privilege-locked (migration
// 20260829201627) -- every select below lists safe columns explicitly.
const SAFE_COLUMNS = "provider, google_calendar_id, status, scopes, connected_at, token_expires_at";

// GET: any company member can see a professional's connection status.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; professionalId: string }> },
) {
  const { companyId, professionalId } = await params;
  const access = await requireProfessionalAccess(companyId, professionalId, "view");
  if (access.error) return access.error;

  const { data, error } = await access.supabase
    .from("company_calendar_connections")
    .select(SAFE_COLUMNS)
    .eq("company_id", companyId)
    .eq("professional_id", professionalId)
    .maybeSingle();
  if (error) {
    console.error("Failed to read Google Calendar connection status", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connection: data ?? null });
}

// PATCH: Body { googleCalendarId } -- switch which calendar of the connected
// account this professional's appointments go to (and whose busy times
// block their availability). Only a calendar the account can write to is
// accepted. Existing events stay where they were created (each appointment
// remembers its calendar); new ones go to the new calendar.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ companyId: string; professionalId: string }> },
) {
  const { companyId, professionalId } = await params;
  const access = await requireProfessionalAccess(companyId, professionalId, "manage");
  if (access.error) return access.error;

  const body = await request.json().catch(() => null);
  const googleCalendarId = typeof body?.googleCalendarId === "string" ? body.googleCalendarId.trim() : "";
  if (!googleCalendarId) {
    return NextResponse.json({ error: "googleCalendarId is required" }, { status: 400 });
  }

  const connection = await getValidAccessToken(professionalId);
  if (!connection) {
    return NextResponse.json({ error: "Google Calendar is not connected" }, { status: 409 });
  }

  let calendars;
  try {
    calendars = await listWritableCalendars(connection.accessToken);
  } catch (err) {
    console.error("Failed to list Google calendars", err);
    return NextResponse.json({ error: "Failed to reach Google Calendar" }, { status: 502 });
  }
  if (googleCalendarId !== "primary" && !calendars.some((c) => c.id === googleCalendarId)) {
    return NextResponse.json({ error: "calendar not found in the connected account" }, { status: 400 });
  }

  try {
    const { data, error } = await createServiceClient()
      .from("company_calendar_connections")
      .update({ google_calendar_id: googleCalendarId })
      .eq("company_id", companyId)
      .eq("professional_id", professionalId)
      .select(SAFE_COLUMNS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ connection: data });
  } catch (err) {
    console.error("Unexpected error choosing a Google calendar", err);
    return NextResponse.json({ error: "Failed to update the calendar" }, { status: 500 });
  }
}

// DELETE: disconnect. Flips status and clears both tokens rather than
// deleting the row, so the last calendar id stays visible -- a no-op (200,
// connection: null) if nothing was ever connected.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; professionalId: string }> },
) {
  const { companyId, professionalId } = await params;
  const access = await requireProfessionalAccess(companyId, professionalId, "manage");
  if (access.error) return access.error;

  try {
    const { data, error } = await createServiceClient()
      .from("company_calendar_connections")
      .update({ status: "disconnected", access_token: null, refresh_token: null, token_expires_at: null })
      .eq("company_id", companyId)
      .eq("professional_id", professionalId)
      .select(SAFE_COLUMNS)
      .maybeSingle();
    if (error) {
      console.error("Failed to disconnect Google Calendar", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ connection: data ?? null });
  } catch (err) {
    console.error("Unexpected error disconnecting Google Calendar", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to disconnect Google Calendar" },
      { status: 500 },
    );
  }
}
