import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listProfessionalsWithServices } from "@/lib/professionals/repository";
import { requireCompanyRole } from "@/lib/professionals/route-auth";

// 2026-09-24 -- the company's professionals (one schedule each; see
// decisions.md "Multiple schedules per company"). Every company starts with
// one, seeded from its name (migration 20260924120000).
//
// Writes go through the service-role client: `professionals` has no write
// grant for regular clients (same lockdown as the connection tables), and
// these routes enforce who may change what.

const MAX_PROFESSIONAL_NAME_LENGTH = 120;

// GET: any member. Includes inactive ones (the dashboard lists them apart),
// the services each is explicitly linked to, and their Google connection
// status.
export async function GET(_request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const access = await requireCompanyRole(companyId, "member");
  if (access.error) return access.error;

  try {
    const [professionals, { data: connections, error }] = await Promise.all([
      listProfessionalsWithServices(access.supabase, companyId, { includeInactive: true }),
      access.supabase
        .from("company_calendar_connections")
        .select("professional_id, status, google_calendar_id")
        .eq("company_id", companyId),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const byProfessional = new Map((connections ?? []).map((c) => [c.professional_id as string, c]));
    return NextResponse.json({
      professionals: professionals.map((p) => ({
        ...p,
        calendarConnected: byProfessional.get(p.id)?.status === "connected",
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// POST: admin-only. Body { name }. Appended after the existing ones; hours
// follow the establishment's until customised.
export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const access = await requireCompanyRole(companyId, "admin");
  if (access.error) return access.error;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name.length > MAX_PROFESSIONAL_NAME_LENGTH) {
    return NextResponse.json({ error: `name must be ${MAX_PROFESSIONAL_NAME_LENGTH} characters or fewer` }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: last } = await service
    .from("professionals")
    .select("position")
    .eq("company_id", companyId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await service
    .from("professionals")
    .insert({ company_id: companyId, name, position: ((last?.position as number | undefined) ?? -1) + 1 })
    .select("id, name, is_active, position, uses_custom_hours, user_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    {
      professional: {
        id: data.id,
        name: data.name,
        isActive: data.is_active,
        position: data.position,
        usesCustomHours: data.uses_custom_hours,
        userId: data.user_id,
        serviceIds: [],
        calendarConnected: false,
      },
    },
    { status: 201 },
  );
}
