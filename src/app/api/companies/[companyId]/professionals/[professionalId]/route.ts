import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireProfessionalAccess } from "@/lib/professionals/route-auth";
import { assignProfessionalEmail, normalizeEmail } from "@/lib/team/invites";
import { removeFromCompany } from "@/lib/team/roles";

// 2026-09-24 -- one professional. PATCH is split by who may do what:
//   - uses_custom_hours: an admin, or the linked team member (it's their own
//     schedule);
//   - name, is_active, position, email, unlink: admins only.
// DELETE deactivates (never hard-deletes -- past appointments keep pointing
// at the row), refusing to leave the company without an active
// professional or to strand upcoming appointments.
//
// 2026-09-25 -- the team member is given by email, not picked from a list
// (see src/lib/team/invites.ts): `email` sets or replaces the address while
// no account is linked (`null` withdraws a pending invite); `unlink: true`
// detaches the linked account -- the owner's call only: for anyone else it
// removes them from the company (same as DELETE members/[userId]); the owner
// unlinking their own schedule keeps the company. Deactivating a schedule
// does NOT remove its person: they keep their login and see "your schedule
// was turned off" until it's reactivated or the owner removes them.

const MAX_NAME_LENGTH = 120;
const COLUMNS = "id, name, is_active, position, uses_custom_hours, user_id, invite_email";

function toJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    position: row.position,
    usesCustomHours: row.uses_custom_hours,
    userId: row.user_id ?? null,
    inviteEmail: row.invite_email ?? null,
  };
}

// Owner-only. Anyone but the owner leaves the company with their schedule's
// link; the owner just detaches from this schedule.
async function detachAccount(
  companyId: string,
  professionalId: string,
  userId: string,
  ownerId: string,
) {
  const service = createServiceClient();
  if (userId !== ownerId) {
    await removeFromCompany(service, companyId, userId, ownerId);
    return;
  }
  const { error } = await service
    .from("professionals")
    .update({ user_id: null })
    .eq("company_id", companyId)
    .eq("id", professionalId);
  if (error) throw new Error(error.message);
}

async function countUpcoming(companyId: string, professionalId: string) {
  const { count, error } = await createServiceClient()
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("professional_id", professionalId)
    .in("status", ["requested", "confirmed"])
    .gte("ends_at", new Date().toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countOtherActive(companyId: string, professionalId: string) {
  const { count, error } = await createServiceClient()
    .from("professionals")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("is_active", true)
    .neq("id", professionalId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ companyId: string; professionalId: string }> },
) {
  const { companyId, professionalId } = await params;
  const access = await requireProfessionalAccess(companyId, professionalId, "manage");
  if (access.error) return access.error;
  const isAdmin = ["owner", "admin"].includes(access.role);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const adminOnly = ["name", "isActive", "position", "email", "unlink"].filter((key) => key in body);
  if (adminOnly.length > 0 && !isAdmin) {
    return NextResponse.json({ error: `Only company owners/admins can change ${adminOnly.join(", ")}` }, { status: 403 });
  }

  const service = createServiceClient();
  const update: Record<string, unknown> = {};

  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: `name must be 1-${MAX_NAME_LENGTH} characters` }, { status: 400 });
    }
    update.name = name;
  }

  if ("position" in body) {
    if (!Number.isInteger(body.position) || body.position < 0) {
      return NextResponse.json({ error: "position must be a non-negative integer" }, { status: 400 });
    }
    update.position = body.position;
  }

  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ error: "isActive must be a boolean" }, { status: 400 });
    }
    if (!body.isActive && access.professional.isActive) {
      if ((await countOtherActive(companyId, professionalId)) === 0) {
        return NextResponse.json({ error: "last_active_professional" }, { status: 409 });
      }
      const upcoming = await countUpcoming(companyId, professionalId);
      if (upcoming > 0) {
        return NextResponse.json({ error: "has_upcoming_appointments", count: upcoming }, { status: 409 });
      }
    }
    update.is_active = body.isActive;
  }

  if ("userId" in body) {
    return NextResponse.json({ error: "userId is no longer accepted; pass email" }, { status: 400 });
  }

  if (body.unlink === true && access.professional.userId) {
    if (access.role !== "owner") {
      return NextResponse.json({ error: "owner_only" }, { status: 403 });
    }
    await detachAccount(companyId, professionalId, access.professional.userId, access.userId);
    access.professional.userId = null;
  }

  if ("email" in body) {
    if (access.professional.userId) {
      return NextResponse.json({ error: "account_already_linked" }, { status: 409 });
    }
    if (body.email === null) {
      update.invite_email = null;
    } else {
      const email = normalizeEmail(body.email);
      if (!email) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
      if (email !== access.professional.inviteEmail) {
        const assignment = await assignProfessionalEmail(
          service,
          { id: professionalId, company_id: companyId, name: (update.name as string) ?? access.professional.name },
          email,
        );
        if (assignment.kind === "conflict") return NextResponse.json({ error: assignment.error }, { status: 409 });
      }
    }
  }

  if ("usesCustomHours" in body) {
    if (typeof body.usesCustomHours !== "boolean") {
      return NextResponse.json({ error: "usesCustomHours must be a boolean" }, { status: 400 });
    }
    // Switching to a schedule of their own starts from a copy of the
    // establishment's hours (only when they have none yet), so the merchant
    // edits instead of retyping a whole week.
    if (body.usesCustomHours && !access.professional.usesCustomHours) {
      const { count } = await service
        .from("business_hours")
        .select("id", { count: "exact", head: true })
        .eq("professional_id", professionalId);
      if ((count ?? 0) === 0) {
        const { data: companyHours, error: hoursError } = await service
          .from("business_hours")
          .select("day_of_week, start_time, end_time, is_active")
          .eq("company_id", companyId)
          .is("professional_id", null);
        if (hoursError) return NextResponse.json({ error: hoursError.message }, { status: 500 });
        if (companyHours && companyHours.length > 0) {
          const { error: copyError } = await service
            .from("business_hours")
            .insert(companyHours.map((h) => ({ ...h, company_id: companyId, professional_id: professionalId })));
          if (copyError) return NextResponse.json({ error: copyError.message }, { status: 500 });
        }
      }
    }
    update.uses_custom_hours = body.usesCustomHours;
  }

  if (Object.keys(update).length === 0) {
    const { data: current, error: readError } = await service
      .from("professionals")
      .select(COLUMNS)
      .eq("company_id", companyId)
      .eq("id", professionalId)
      .single();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
    return NextResponse.json({ professional: toJson(current) });
  }

  const { data, error } = await service
    .from("professionals")
    .update(update)
    .eq("company_id", companyId)
    .eq("id", professionalId)
    .select(COLUMNS)
    .single();
  if (error) {
    // professionals_one_per_user_idx: that member already runs another
    // professional's schedule in this company.
    if (error.code === "23505") {
      return NextResponse.json({ error: "user_already_linked" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ professional: toJson(data) });
}

// DELETE: admin-only deactivate -- same rules as PATCH { isActive: false }.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; professionalId: string }> },
) {
  const { companyId, professionalId } = await params;
  const access = await requireProfessionalAccess(companyId, professionalId, "manage");
  if (access.error) return access.error;
  if (!["owner", "admin"].includes(access.role)) {
    return NextResponse.json({ error: "Only company owners/admins can remove a professional" }, { status: 403 });
  }
  if (!access.professional.isActive) return NextResponse.json({ professional: access.professional });

  if ((await countOtherActive(companyId, professionalId)) === 0) {
    return NextResponse.json({ error: "last_active_professional" }, { status: 409 });
  }
  const upcoming = await countUpcoming(companyId, professionalId);
  if (upcoming > 0) {
    return NextResponse.json({ error: "has_upcoming_appointments", count: upcoming }, { status: 409 });
  }

  const { data, error } = await createServiceClient()
    .from("professionals")
    .update({ is_active: false })
    .eq("company_id", companyId)
    .eq("id", professionalId)
    .select(COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ professional: toJson(data) });
}
