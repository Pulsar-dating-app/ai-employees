import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

// 2026-09-25 -- professionals join a company by email, with no invite email
// sent: the owner adds "Tobias, tobias@x.com" and tells Tobias to create an
// account with that address. Until then the address waits on
// professionals.invite_email; the first time that account reaches the
// dashboard (or onboarding) it is claimed here -- company_users(member) is
// created, the professional is linked, and the invite is cleared, so the
// email is never stored twice. Email confirmation is off in production, so
// whoever signs up with the address gets the seat: an accepted risk, see
// decisions.md.
//
// Service-role throughout: the claimant isn't a member yet, so RLS would hide
// the professional from them, and professionals/company_users writes are
// service-only anyway.

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

// ilike without wildcards: `_` and `%` are legal in an address.
function exactIlike(email: string): string {
  return email.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function findUserByEmail(
  service: SupabaseClient,
  email: string,
): Promise<{ id: string; name: string | null } | null> {
  const { data, error } = await service.from("users").select("id, name").ilike("email", exactIlike(email)).maybeSingle();
  if (error) throw error;
  return (data as { id: string; name: string | null } | null) ?? null;
}

export async function companyOfUser(service: SupabaseClient, userId: string): Promise<{ companyId: string; role: string } | null> {
  const { data, error } = await service.from("company_users").select("company_id, role").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? { companyId: data.company_id as string, role: data.role as string } : null;
}

// Makes `userId` a member of the professional's company and links them.
// Fills users.name from the professional's name when the account has none,
// so a joining professional never sees the "your name" onboarding step.
export async function linkUserToProfessional(
  service: SupabaseClient,
  professional: { id: string; company_id: string; name: string },
  userId: string,
): Promise<void> {
  const { error: memberError } = await service
    .from("company_users")
    .insert({ company_id: professional.company_id, user_id: userId, role: "member" });
  // 23505: already has a company (unique(user_id)) -- a concurrent claim won.
  if (memberError && memberError.code !== "23505") throw memberError;
  if (memberError) {
    const existing = await companyOfUser(service, userId);
    if (existing?.companyId !== professional.company_id) return;
  }

  const { error: linkError } = await service
    .from("professionals")
    .update({ user_id: userId, invite_email: null })
    .eq("id", professional.id)
    .eq("company_id", professional.company_id);
  if (linkError) throw linkError;

  const { error: nameError } = await service
    .from("users")
    .update({ name: professional.name })
    .eq("id", userId)
    .is("name", null);
  if (nameError) throw nameError;
}

// What giving a professional an email does, decided from the facts about that
// address (pure, so the rules are unit-tested on their own):
//   - another professional already waits on it: taken (here) or blocked
//     (another company) -- one pending invite per address;
//   - it's an account of another company: blocked (one company per account);
//   - it's an account of this company (the owner adding themselves, an
//     admin): linked right away, role unchanged -- unless that account
//     already runs another professional's schedule here;
//   - it's an account with no company: it joins as a member right away;
//   - nobody has it: stored as a pending invite, claimed at sign-up.
export type EmailAssignment =
  | { kind: "link"; userId: string; addMember: boolean }
  | { kind: "invite" }
  | { kind: "conflict"; error: "email_in_other_company" | "email_taken_in_company" };

export function decideEmailAssignment(facts: {
  companyId: string;
  pendingInviteCompanyId: string | null;
  account: { id: string; companyId: string | null; linkedHere: boolean } | null;
}): EmailAssignment {
  if (facts.pendingInviteCompanyId) {
    return {
      kind: "conflict",
      error: facts.pendingInviteCompanyId === facts.companyId ? "email_taken_in_company" : "email_in_other_company",
    };
  }
  const account = facts.account;
  if (!account) return { kind: "invite" };
  if (account.companyId && account.companyId !== facts.companyId) {
    return { kind: "conflict", error: "email_in_other_company" };
  }
  if (account.companyId === facts.companyId) {
    return account.linkedHere
      ? { kind: "conflict", error: "email_taken_in_company" }
      : { kind: "link", userId: account.id, addMember: false };
  }
  return { kind: "link", userId: account.id, addMember: true };
}

// Gathers the facts for decideEmailAssignment and applies the outcome to
// `professional` (which must have no linked account). Returns the outcome so
// the route can answer 409 on a conflict.
export async function assignProfessionalEmail(
  service: SupabaseClient,
  professional: { id: string; company_id: string; name: string },
  email: string,
): Promise<EmailAssignment> {
  const [{ data: pending, error: pendingError }, account] = await Promise.all([
    service
      .from("professionals")
      .select("company_id")
      .eq("invite_email", email)
      .neq("id", professional.id)
      .maybeSingle(),
    findUserByEmail(service, email),
  ]);
  if (pendingError) throw pendingError;

  let accountFacts: { id: string; companyId: string | null; linkedHere: boolean } | null = null;
  if (account) {
    const membership = await companyOfUser(service, account.id);
    let linkedHere = false;
    if (membership?.companyId === professional.company_id) {
      const { count, error } = await service
        .from("professionals")
        .select("id", { count: "exact", head: true })
        .eq("company_id", professional.company_id)
        .eq("user_id", account.id)
        .neq("id", professional.id);
      if (error) throw error;
      linkedHere = (count ?? 0) > 0;
    }
    accountFacts = { id: account.id, companyId: membership?.companyId ?? null, linkedHere };
  }

  const outcome = decideEmailAssignment({
    companyId: professional.company_id,
    pendingInviteCompanyId: (pending?.company_id as string | undefined) ?? null,
    account: accountFacts,
  });

  if (outcome.kind === "invite") {
    const { error } = await service
      .from("professionals")
      .update({ invite_email: email })
      .eq("id", professional.id)
      .eq("company_id", professional.company_id);
    if (error) {
      // professionals_invite_email_idx: a concurrent add of the same address.
      if (error.code === "23505") return { kind: "conflict", error: "email_taken_in_company" };
      throw error;
    }
  } else if (outcome.kind === "link") {
    if (outcome.addMember) {
      await linkUserToProfessional(service, professional, outcome.userId);
    } else {
      const { error } = await service
        .from("professionals")
        .update({ user_id: outcome.userId, invite_email: null })
        .eq("id", professional.id)
        .eq("company_id", professional.company_id);
      if (error) {
        if (error.code === "23505") return { kind: "conflict", error: "email_taken_in_company" };
        throw error;
      }
    }
  }
  return outcome;
}

// Takes a member's access away when their professional is deactivated or
// unlinked. Owners and admins keep theirs -- the company is theirs to run
// whether or not they take bookings.
export async function removeMemberAccess(service: SupabaseClient, companyId: string, userId: string): Promise<void> {
  const { error } = await service
    .from("company_users")
    .delete()
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("role", "member");
  if (error) throw error;
}

// Returns true when the account was just placed into a company.
export async function claimPendingInvite(user: { id: string; email?: string | null }): Promise<boolean> {
  const email = normalizeEmail(user.email);
  if (!email) return false;

  const service = createServiceClient();
  if (await companyOfUser(service, user.id)) return false;

  const { data: professional, error } = await service
    .from("professionals")
    .select("id, company_id, name")
    .eq("invite_email", email)
    .eq("is_active", true)
    .is("user_id", null)
    .maybeSingle();
  if (error) throw error;
  if (!professional) return false;

  await linkUserToProfessional(service, professional as { id: string; company_id: string; name: string }, user.id);
  return Boolean(await companyOfUser(service, user.id));
}
