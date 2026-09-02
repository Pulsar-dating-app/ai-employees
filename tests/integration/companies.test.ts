import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

describe("GET/POST /api/companies", () => {
  it("requires authentication", async () => {
    expect((await api("GET", "/api/companies")).status).toBe(401);
    expect((await api("POST", "/api/companies", undefined, { name: "Nope Co" })).status).toBe(401);
  });

  it("creates a company atomically and makes the creator its owner", async () => {
    const owner = await signUpTestUser("owner");

    const before = await api<{ companies: unknown[] }>("GET", "/api/companies", owner.cookieHeader);
    expect(before.status).toBe(200);
    expect(before.json.companies).toEqual([]);

    const created = await api<{ company: { id: string; name: string } }>(
      "POST",
      "/api/companies",
      owner.cookieHeader,
      { name: "Acme Co", currency: "USD", country: "US" },
    );
    expect(created.status).toBe(201);
    expect(created.json.company.name).toBe("Acme Co");

    const after = await api<{ companies: unknown[] }>("GET", "/api/companies", owner.cookieHeader);
    expect(after.json.companies).toHaveLength(1);
  });

  it("rejects a company with no name", async () => {
    const owner = await signUpTestUser("owner");
    const result = await api("POST", "/api/companies", owner.cookieHeader, {});
    expect(result.status).toBe(400);
  });

  // create_company_with_owner used to 500 here: generate_unique_company_slug
  // checks for a free slug and then inserts, which isn't atomic, so two
  // callers racing on the same name both picked the same candidate and the
  // loser tripped companies_slug_unique. The RPC now retries on
  // unique_violation (migration 20260831120000). Six at once because the
  // window is small — a single pair reproduces it only sometimes.
  it("survives concurrent creates that slugify to the same name", async () => {
    const owners = await Promise.all(
      Array.from({ length: 6 }, () => signUpTestUser("slug-race")),
    );

    const results = await Promise.all(
      owners.map((owner) =>
        api<{ company: { id: string; slug: string } }>("POST", "/api/companies", owner.cookieHeader, {
          name: "Slug Race Co",
        }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual(Array(owners.length).fill(201));
    const slugs = results.map((r) => r.json.company.slug);
    expect(new Set(slugs).size).toBe(owners.length);
    // First one keeps the clean slug; the rest fall back to -2, -3, ...
    expect(slugs).toContain("slug-race-co");
  });
});

describe("POST /api/companies/:id/members", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  it("blocks non-members, validates the role, and rejects duplicate members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Beta Co");

    const blocked = await api(
      "POST",
      `/api/companies/${companyId}/members`,
      outsider.cookieHeader,
      { userId: outsider.userId, role: "member" },
    );
    expect(blocked.status).toBe(403);

    const badRole = await api(
      "POST",
      `/api/companies/${companyId}/members`,
      owner.cookieHeader,
      { userId: outsider.userId, role: "bogus" },
    );
    expect(badRole.status).toBe(400);

    const added = await api(
      "POST",
      `/api/companies/${companyId}/members`,
      owner.cookieHeader,
      { userId: outsider.userId, role: "member" },
    );
    expect(added.status).toBe(201);

    const duplicate = await api(
      "POST",
      `/api/companies/${companyId}/members`,
      owner.cookieHeader,
      { userId: outsider.userId, role: "member" },
    );
    expect(duplicate.status).toBe(409);

    const nowVisible = await api<{ companies: unknown[] }>("GET", "/api/companies", outsider.cookieHeader);
    expect(nowVisible.json.companies).toHaveLength(1);
  });

  it("only lets an existing owner assign the owner role", async () => {
    const owner = await signUpTestUser("owner");
    const admin = await signUpTestUser("admin");
    const target = await signUpTestUser("target");
    const companyId = await createCompany(owner.cookieHeader, "Gamma Co");

    await api("POST", `/api/companies/${companyId}/members`, owner.cookieHeader, {
      userId: admin.userId,
      role: "admin",
    });

    const adminPromotesToOwner = await api(
      "POST",
      `/api/companies/${companyId}/members`,
      admin.cookieHeader,
      { userId: target.userId, role: "owner" },
    );
    expect(adminPromotesToOwner.status).toBe(403);

    const adminAddsMember = await api(
      "POST",
      `/api/companies/${companyId}/members`,
      admin.cookieHeader,
      { userId: target.userId, role: "member" },
    );
    expect(adminAddsMember.status).toBe(201);
  });
});

describe("GET/PATCH /api/companies/:id", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check Co");

    expect((await api("GET", `/api/companies/${companyId}`)).status).toBe(401);
    expect((await api("PATCH", `/api/companies/${companyId}`, undefined, { name: "Nope" })).status).toBe(401);
  });

  it("lets a plain member view but not update; lets an admin do both", async () => {
    const owner = await signUpTestUser("owner");
    const member = await signUpTestUser("member");
    const companyId = await createCompany(owner.cookieHeader, "Delta Co");

    await api("POST", `/api/companies/${companyId}/members`, owner.cookieHeader, {
      userId: member.userId,
      role: "member",
    });

    const memberGet = await api("GET", `/api/companies/${companyId}`, member.cookieHeader);
    expect(memberGet.status).toBe(200);

    const memberPatch = await api("PATCH", `/api/companies/${companyId}`, member.cookieHeader, {
      description: "Should be blocked",
    });
    expect(memberPatch.status).toBe(403);

    const ownerPatch = await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
      description: "Owner can edit",
    });
    expect(ownerPatch.status).toBe(200);
  });

  it("returns the full knowledge + profile field set on GET", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Epsilon Co");

    const result = await api<{ company: Record<string, unknown> }>(
      "GET",
      `/api/companies/${companyId}`,
      owner.cookieHeader,
    );
    expect(result.status).toBe(200);
    for (const field of [
      "name",
      "email",
      "phone",
      "website_url",
      "description",
      "shipping_policy",
      "return_policy",
      "payment_policy",
      "faq",
      "additional_information",
      "currency",
      "country",
      "timezone",
    ]) {
      expect(result.json.company).toHaveProperty(field);
    }
  });

  it("updates only the fields sent, leaving the rest untouched", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Zeta Co");

    await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
      shipping_policy: "Ships in 3-5 days",
      country: "BR",
    });

    const patched = await api<{
      company: { return_policy: string; shipping_policy: string; country: string; name: string };
    }>(
      "PATCH",
      `/api/companies/${companyId}`,
      owner.cookieHeader,
      { return_policy: "30 days" },
    );
    expect(patched.status).toBe(200);
    expect(patched.json.company.return_policy).toBe("30 days");
    expect(patched.json.company.shipping_policy).toBe("Ships in 3-5 days"); // untouched by the second PATCH
    expect(patched.json.company.country).toBe("BR"); // untouched
    expect(patched.json.company.name).toBe("Zeta Co"); // untouched
  });

  it("clears a field with an explicit null, distinct from omitting it", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Eta Co");

    await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, { email: "old@eta.co" });

    const cleared = await api<{ company: { email: string | null } }>(
      "PATCH",
      `/api/companies/${companyId}`,
      owner.cookieHeader,
      { email: null },
    );
    expect(cleared.status).toBe(200);
    expect(cleared.json.company.email).toBeNull();
  });

  it("round-trips a valid faq array and rejects a malformed entry", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Theta Co");

    const valid = await api<{ company: { faq: { question: string; answer: string }[] } }>(
      "PATCH",
      `/api/companies/${companyId}`,
      owner.cookieHeader,
      { faq: [{ question: "Do you ship internationally?", answer: "Yes, worldwide." }] },
    );
    expect(valid.status).toBe(200);
    expect(valid.json.company.faq).toHaveLength(1);

    const malformed = await api(
      "PATCH",
      `/api/companies/${companyId}`,
      owner.cookieHeader,
      { faq: [{ question: "Missing an answer" }] },
    );
    expect(malformed.status).toBe(400);
  });

  it("rejects a currency that isn't exactly 3 characters", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Iota Co");

    const result = await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
      currency: "US",
    });
    expect(result.status).toBe(400);
  });

  it("rejects a description over the max length", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Kappa Co");

    const result = await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
      description: "x".repeat(5001),
    });
    expect(result.status).toBe(400);
  });

  it("rejects a body with no recognized fields", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Lambda Co");

    const result = await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, {
      notARealField: "x",
    });
    expect(result.status).toBe(400);
  });

  it("(J7) accepts whole-number scheduling policy fields and rejects bad ones", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Policy Co");

    const ok = await api<{ company: { min_lead_time_minutes: number; cancellation_cutoff_hours: number } }>(
      "PATCH",
      `/api/companies/${companyId}`,
      owner.cookieHeader,
      { min_lead_time_minutes: 120, cancellation_cutoff_hours: 24 },
    );
    expect(ok.status).toBe(200);
    expect(ok.json.company).toMatchObject({ min_lead_time_minutes: 120, cancellation_cutoff_hours: 24 });

    for (const bad of [{ min_lead_time_minutes: -1 }, { min_lead_time_minutes: 1.5 }, { cancellation_cutoff_hours: 99999 }]) {
      const res = await api("PATCH", `/api/companies/${companyId}`, owner.cookieHeader, bad);
      expect(res.status).toBe(400);
    }
  });
});
