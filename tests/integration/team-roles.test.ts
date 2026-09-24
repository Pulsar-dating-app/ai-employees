import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { getTestServiceClient } from "./helpers/service-client";
import { seedActivePlan } from "./helpers/billing";
import { getTestEnv } from "./helpers/env";
import { defaultProfessionalId } from "./helpers/professionals";

// 2026-09-25 -- team members join by email and see only their own schedule
// (decisions.md "Team members join by email"). Real routes, real RLS: the
// PostgREST checks go around the app on purpose, since a route guard alone
// can't stop a member calling Supabase directly with their own session.

// A redirect from a layout is a real 307. One from a page under a
// loading.tsx boundary happens after the shell has streamed, so Next sends a
// 200 carrying <meta id="__next-page-redirect" http-equiv="refresh"> instead
// -- both count as "redirected" here.
async function page(path: string, cookie: string) {
  const { baseUrl } = getTestEnv();
  const res = await fetch(baseUrl + path, { headers: { cookie }, redirect: "manual" });
  const location = res.headers.get("location");
  const html = res.status === 200 ? await res.text() : "";
  const streamed = html.match(/id="__next-page-redirect"[^>]*content="\d+;url=([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
  const target = location ?? streamed ?? null;
  if (!target) {
    const leaked = html.match(/"(Onboarding|Dashboard|Scheduling)\.[A-Za-z.]+"|>(Onboarding|Dashboard|Scheduling)\.[A-Za-z.]+</);
    if (leaked) throw new Error(`Unresolved message key rendered on ${path}: ${leaked[0]}`);
  }
  return { status: res.status, redirectedTo: target ? new URL(target, baseUrl).pathname : null };
}

function freshEmail(label = "pro") {
  return `${label}-${randomUUID()}@example.test`;
}

// A finished company with Ana hired, a service, and hours -- the dashboard
// lets its owner straight in.
async function seedCompany(owner: TestUser) {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", owner.cookieHeader, {
    name: `Roles Co ${randomUUID().slice(0, 8)}`,
    timezone: "UTC",
  });
  const companyId = created.json.company.id;
  await seedActivePlan(companyId);
  await api("POST", `/api/companies/${companyId}/agents/ana`, owner.cookieHeader);
  const service = await api<{ service: { id: string } }>("POST", `/api/companies/${companyId}/services`, owner.cookieHeader, {
    name: "Corte",
    duration_minutes: 30,
  });
  await getTestServiceClient()
    .from("companies")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", companyId);
  return { companyId, serviceId: service.json.service.id, ownerProfessionalId: await defaultProfessionalId(companyId) };
}

async function addProfessional(companyId: string, cookie: string, name: string, email: string) {
  return api<{ professional: { id: string; userId: string | null; inviteEmail: string | null }; error?: string }>(
    "POST",
    `/api/companies/${companyId}/professionals`,
    cookie,
    { name, email },
  );
}

// Adds "Tobias" by email, then Tobias signs up with it and opens the
// dashboard -- which is where the invite is claimed.
async function inviteAndJoin(owner: TestUser, companyId: string) {
  const email = freshEmail("tobias");
  const added = await addProfessional(companyId, owner.cookieHeader, "Tobias", email);
  expect(added.status).toBe(201);
  const member = await signUpTestUser("tobias", { email, name: null });
  const landing = await page("/dashboard", member.cookieHeader);
  return { member, professionalId: added.json.professional.id, landing };
}

async function createCustomer(companyId: string, name: string) {
  const { data, error } = await getTestServiceClient()
    .from("customers")
    .insert({ company_id: companyId, name, phone: `+1555${Math.floor(Math.random() * 1e7).toString().padStart(7, "0")}`, channel: "whatsapp" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function createAppointment(companyId: string, serviceId: string, professionalId: string, customerId: string, startsAt: string) {
  const { data, error } = await getTestServiceClient()
    .from("appointments")
    .insert({
      company_id: companyId,
      service_id: serviceId,
      professional_id: professionalId,
      customer_id: customerId,
      starts_at: startsAt,
      ends_at: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(),
      status: "confirmed",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

describe("the owner is the company's first professional", () => {
  it("company creation links the seeded professional to the owner", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, ownerProfessionalId } = await seedCompany(owner);
    const { data } = await getTestServiceClient()
      .from("professionals")
      .select("user_id")
      .eq("id", ownerProfessionalId)
      .single();
    expect(data?.user_id).toBe(owner.userId);
    const { data: membership } = await getTestServiceClient()
      .from("company_users")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", owner.userId)
      .single();
    expect(membership?.role).toBe("owner");
  });
});

describe("joining by email", () => {
  it("a pending invite is claimed at sign-up: straight to the agenda, no onboarding", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId } = await seedCompany(owner);
    const email = freshEmail("tobias");

    const added = await addProfessional(companyId, owner.cookieHeader, "Tobias", email);
    expect(added.status).toBe(201);
    expect(added.json.professional).toMatchObject({ userId: null, inviteEmail: email });

    // Sign-up with a different case still matches.
    const member = await signUpTestUser("tobias", { email: email.toUpperCase(), name: null });
    const landing = await page("/dashboard", member.cookieHeader);
    expect(landing.redirectedTo).toBe("/dashboard/scheduling");

    const service = getTestServiceClient();
    const { data: membership } = await service
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", member.userId)
      .single();
    expect(membership).toEqual({ company_id: companyId, role: "member" });
    const { data: professional } = await service
      .from("professionals")
      .select("user_id, invite_email")
      .eq("id", added.json.professional.id)
      .single();
    expect(professional).toEqual({ user_id: member.userId, invite_email: null });
    // Named after the professional, so they never see the "your name" step.
    const { data: profile } = await service.from("users").select("name").eq("id", member.userId).single();
    expect(profile?.name).toBe("Tobias");

    expect((await page("/dashboard/scheduling", member.cookieHeader)).status).toBe(200);
    expect((await page("/onboarding", member.cookieHeader)).redirectedTo).toBe("/dashboard");
  });

  it("an existing account with no company is linked immediately", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId } = await seedCompany(owner);
    const loner = await signUpTestUser("loner");
    const added = await addProfessional(companyId, owner.cookieHeader, "Loner", loner.email);
    expect(added.status).toBe(201);
    expect(added.json.professional.userId).toBe(loner.userId);
    expect((await page("/dashboard", loner.cookieHeader)).redirectedTo).toBe("/dashboard/scheduling");
  });

  it("an email of another company, or already waiting elsewhere, is refused", async () => {
    const ownerA = await signUpTestUser("owner-a");
    const ownerB = await signUpTestUser("owner-b");
    const a = await seedCompany(ownerA);
    const b = await seedCompany(ownerB);

    const otherOwner = await addProfessional(a.companyId, ownerA.cookieHeader, "Dono B", ownerB.email);
    expect(otherOwner.status).toBe(409);
    expect(otherOwner.json.error).toBe("email_in_other_company");

    const email = freshEmail();
    expect((await addProfessional(b.companyId, ownerB.cookieHeader, "Pending", email)).status).toBe(201);
    const pendingElsewhere = await addProfessional(a.companyId, ownerA.cookieHeader, "Pending Too", email);
    expect(pendingElsewhere.status).toBe(409);
    expect(pendingElsewhere.json.error).toBe("email_in_other_company");
    const sameCompany = await addProfessional(b.companyId, ownerB.cookieHeader, "Twice", email);
    expect(sameCompany.json.error).toBe("email_taken_in_company");

    // A refused add leaves nothing behind.
    const { count } = await getTestServiceClient()
      .from("professionals")
      .select("id", { count: "exact", head: true })
      .eq("company_id", a.companyId);
    expect(count).toBe(1);
  });

  it("the owner can add their own email to their own schedule", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId } = await seedCompany(owner);
    // The seeded professional is already theirs; a second one can't be.
    const second = await addProfessional(companyId, owner.cookieHeader, "Me Again", owner.email);
    expect(second.status).toBe(409);
    expect(second.json.error).toBe("email_taken_in_company");
  });

  it("deactivating a member's schedule takes their access away; the owner keeps theirs", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId } = await seedCompany(owner);
    const { member, professionalId } = await inviteAndJoin(owner, companyId);

    const off = await api("DELETE", `/api/companies/${companyId}/professionals/${professionalId}`, owner.cookieHeader);
    expect(off.status).toBe(200);
    const { data: membership } = await getTestServiceClient()
      .from("company_users")
      .select("role")
      .eq("user_id", member.userId)
      .maybeSingle();
    expect(membership).toBeNull();
    expect((await page("/dashboard", owner.cookieHeader)).status).toBe(200);
  });
});

describe("a member's dashboard", () => {
  it("offers only their agenda and own schedule; company pages redirect", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, ownerProfessionalId } = await seedCompany(owner);
    const { member, professionalId } = await inviteAndJoin(owner, companyId);

    for (const path of [
      "/dashboard/settings",
      "/dashboard/products",
      "/dashboard/conversations",
      "/dashboard/metrics",
      "/dashboard/scheduling/services",
      "/dashboard/scheduling/settings",
      "/dashboard/scheduling/professionals",
      `/dashboard/scheduling/professionals/${ownerProfessionalId}`,
    ]) {
      expect((await page(path, member.cookieHeader)).redirectedTo, path).toBe("/dashboard/scheduling");
    }
    expect((await page(`/dashboard/scheduling/professionals/${professionalId}`, member.cookieHeader)).status).toBe(200);
  });
});

describe("what a member can change", () => {
  it("company-level writes are admin-only, through the API and straight through PostgREST", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, serviceId } = await seedCompany(owner);
    const { member, professionalId } = await inviteAndJoin(owner, companyId);

    expect(
      (await api("POST", `/api/companies/${companyId}/services`, member.cookieHeader, { name: "X", duration_minutes: 30 })).status,
    ).toBe(403);
    expect((await api("PATCH", `/api/companies/${companyId}/services/${serviceId}`, member.cookieHeader, { name: "Y" })).status).toBe(403);
    expect((await api("POST", `/api/companies/${companyId}/products`, member.cookieHeader, { name: "P" })).status).toBe(403);
    expect((await api("GET", `/api/companies/${companyId}/conversations`, member.cookieHeader)).status).toBe(403);
    expect((await api("GET", `/api/companies/${companyId}/analytics`, member.cookieHeader)).status).toBe(403);
    expect(
      (
        await api("PUT", `/api/companies/${companyId}/business-hours`, member.cookieHeader, {
          businessHours: [{ day_of_week: 1, start_time: "08:00", end_time: "18:00" }],
        })
      ).status,
    ).toBe(403);
    // ...but their own hours are theirs.
    expect(
      (
        await api("PUT", `/api/companies/${companyId}/business-hours?professionalId=${professionalId}`, member.cookieHeader, {
          businessHours: [{ day_of_week: 1, start_time: "08:00", end_time: "12:00" }],
        })
      ).status,
    ).toBe(200);

    // Direct PostgREST, around the routes.
    const serviceInsert = await member.client
      .from("services")
      .insert({ company_id: companyId, name: "Direct", duration_minutes: 30 })
      .select();
    expect(serviceInsert.error).not.toBeNull();
    const serviceUpdate = await member.client.from("services").update({ name: "Hacked" }).eq("id", serviceId).select();
    expect(serviceUpdate.data ?? []).toHaveLength(0);
    const establishmentHours = await member.client
      .from("business_hours")
      .insert({ company_id: companyId, day_of_week: 2, start_time: "08:00", end_time: "09:00" })
      .select();
    expect(establishmentHours.error).not.toBeNull();
    const ownHours = await member.client
      .from("business_hours")
      .insert({ company_id: companyId, professional_id: professionalId, day_of_week: 3, start_time: "08:00", end_time: "09:00" })
      .select();
    expect(ownHours.error).toBeNull();
    const conversations = await member.client.from("conversations").select("id").eq("company_id", companyId);
    expect(conversations.data ?? []).toHaveLength(0);
  });

  it("sees and changes only their own appointments and customers", async () => {
    const owner = await signUpTestUser("owner");
    const { companyId, serviceId, ownerProfessionalId } = await seedCompany(owner);
    const { member, professionalId } = await inviteAndJoin(owner, companyId);

    const mine = await createCustomer(companyId, "Cliente do Tobias");
    const theirs = await createCustomer(companyId, "Cliente do Dono");
    const myAppointment = await createAppointment(companyId, serviceId, professionalId, mine, "2027-03-01T10:00:00.000Z");
    const ownerAppointment = await createAppointment(companyId, serviceId, ownerProfessionalId, theirs, "2027-03-01T10:00:00.000Z");

    // The route forces their own filter, whatever they ask for.
    const listed = await api<{ appointments: { id: string }[] }>(
      "GET",
      `/api/companies/${companyId}/appointments?professionalId=${ownerProfessionalId}`,
      member.cookieHeader,
    );
    expect(listed.json.appointments.map((a) => a.id)).toEqual([myAppointment]);

    // RLS agrees.
    const direct = await member.client.from("appointments").select("id").eq("company_id", companyId);
    expect(direct.data?.map((a) => a.id)).toEqual([myAppointment]);
    const customers = await member.client.from("customers").select("id").eq("company_id", companyId);
    expect(customers.data?.map((c) => c.id)).toEqual([mine]);

    // Someone else's appointment doesn't exist for them.
    expect((await api("DELETE", `/api/companies/${companyId}/appointments/${ownerAppointment}`, member.cookieHeader)).status).toBe(404);
    // Their own can be cancelled, but not handed to someone else.
    expect(
      (
        await api("PATCH", `/api/companies/${companyId}/appointments/${myAppointment}`, member.cookieHeader, {
          professional_id: ownerProfessionalId,
        })
      ).status,
    ).toBe(403);
    expect((await api("DELETE", `/api/companies/${companyId}/appointments/${myAppointment}`, member.cookieHeader)).status).toBe(200);

    // The owner still sees everything.
    const all = await api<{ appointments: { id: string }[] }>("GET", `/api/companies/${companyId}/appointments`, owner.cookieHeader);
    expect(all.json.appointments.map((a) => a.id).sort()).toEqual([myAppointment, ownerAppointment].sort());
  });
});

describe("every account has a name", () => {
  it("a nameless new account is asked for it before creating a company", async () => {
    const newcomer = await signUpTestUser("newcomer", { name: null });
    expect((await page("/onboarding", newcomer.cookieHeader)).redirectedTo).toBe("/onboarding/profile");
    expect((await page("/onboarding/profile", newcomer.cookieHeader)).status).toBe(200);
  });

  it("a finished owner without a name is sent to the profile step once", async () => {
    const owner = await signUpTestUser("owner");
    await seedCompany(owner);
    await getTestServiceClient().from("users").update({ name: null }).eq("id", owner.userId);
    expect((await page("/dashboard", owner.cookieHeader)).redirectedTo).toBe("/onboarding/profile");

    await owner.client.from("users").update({ name: "Maria" }).eq("id", owner.userId);
    expect((await page("/dashboard", owner.cookieHeader)).status).toBe(200);
    expect((await page("/onboarding/profile", owner.cookieHeader)).redirectedTo).toBe("/dashboard");
  });
});
