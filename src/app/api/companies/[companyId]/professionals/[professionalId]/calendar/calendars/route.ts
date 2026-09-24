import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getValidAccessToken } from "@/lib/google-calendar/connection";
import { createCalendar, listWritableCalendars } from "@/lib/google-calendar/calendars";
import { isValidTimeZone } from "@/lib/analytics/load";
import { requireProfessionalAccess } from "@/lib/professionals/route-auth";

// 2026-09-24 -- the calendars of the Google account connected for one
// professional: list them (GET) so the dashboard can offer a picker, or
// create a dedicated one named after the professional (POST) and select it
// right away. Creating is what lets a barbershop owner connect their own
// account once per barber and still keep each barber's appointments apart.

async function connectionOr409(professionalId: string) {
  const connection = await getValidAccessToken(professionalId);
  if (!connection) {
    return { error: NextResponse.json({ error: "Google Calendar is not connected" }, { status: 409 }) };
  }
  return { connection };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; professionalId: string }> },
) {
  const { companyId, professionalId } = await params;
  const access = await requireProfessionalAccess(companyId, professionalId, "manage");
  if (access.error) return access.error;

  const result = await connectionOr409(professionalId);
  if (result.error) return result.error;

  try {
    const calendars = await listWritableCalendars(result.connection.accessToken);
    return NextResponse.json({ calendars, selected: result.connection.calendarId });
  } catch (err) {
    console.error("Failed to list Google calendars", err);
    return NextResponse.json({ error: "Failed to reach Google Calendar" }, { status: 502 });
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; professionalId: string }> },
) {
  const { companyId, professionalId } = await params;
  const access = await requireProfessionalAccess(companyId, professionalId, "manage");
  if (access.error) return access.error;

  const result = await connectionOr409(professionalId);
  if (result.error) return result.error;

  const { data: company } = await access.supabase.from("companies").select("timezone").eq("id", companyId).maybeSingle();
  const timeZone = company?.timezone && isValidTimeZone(company.timezone) ? company.timezone : "UTC";

  let calendar;
  try {
    calendar = await createCalendar(result.connection.accessToken, `${access.professional.name} · Staffra`, timeZone);
  } catch (err) {
    console.error("Failed to create a Google calendar", err);
    return NextResponse.json({ error: "Failed to reach Google Calendar" }, { status: 502 });
  }

  try {
    const { error } = await createServiceClient()
      .from("company_calendar_connections")
      .update({ google_calendar_id: calendar.id })
      .eq("company_id", companyId)
      .eq("professional_id", professionalId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } catch (err) {
    console.error("Unexpected error selecting the new Google calendar", err);
    return NextResponse.json({ error: "Failed to update the calendar" }, { status: 500 });
  }

  return NextResponse.json({ calendar }, { status: 201 });
}
