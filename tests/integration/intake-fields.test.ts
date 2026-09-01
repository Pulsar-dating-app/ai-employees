import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

// Trello K8 — appointment_intake_fields + GET/PUT
// /api/companies/:id/intake-fields. Whole-list-replace semantics like
// business-hours: PUT wipes and rewrites, `position` comes from array order,
// member-level auth.
describe("Appointment intake fields — /api/companies/:id/intake-fields", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, {
      name,
    });
    return created.json.company.id;
  }

  async function addMember(ownerCookie: string, companyId: string, userId: string) {
    await api("POST", `/api/companies/${companyId}/members`, ownerCookie, {
      userId,
      role: "member",
    });
  }

  type FieldRow = { id: string; label: string; is_required: boolean; position: number };

  function list(cookie: string | undefined, companyId: string) {
    return api<{ intakeFields: FieldRow[] }>(
      "GET",
      `/api/companies/${companyId}/intake-fields`,
      cookie,
    );
  }

  function replace(cookie: string | undefined, companyId: string, intakeFields: unknown) {
    return api<{ intakeFields: FieldRow[] }>(
      "PUT",
      `/api/companies/${companyId}/intake-fields`,
      cookie,
      { intakeFields },
    );
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check Intake Co");

    expect((await list(undefined, companyId)).status).toBe(401);
    expect((await replace(undefined, companyId, [{ label: "Name" }])).status).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Members Only Intake Co");

    expect((await list(outsider.cookieHeader, companyId)).status).toBe(403);
    expect((await replace(outsider.cookieHeader, companyId, [{ label: "Name" }])).status).toBe(403);
  });

  it("returns an empty list before anything is configured", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Empty Intake Co");

    const res = await list(owner.cookieHeader, companyId);
    expect(res.status).toBe(200);
    expect(res.json.intakeFields).toEqual([]);
  });

  it("validates the payload on PUT", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Payload Intake Co");

    expect((await replace(owner.cookieHeader, companyId, "not-an-array")).status).toBe(400);
    expect((await replace(owner.cookieHeader, companyId, [{ label: "   " }])).status).toBe(400);
    expect((await replace(owner.cookieHeader, companyId, [{ label: 42 }])).status).toBe(400);
    expect(
      (await replace(owner.cookieHeader, companyId, [{ label: "x".repeat(121) }])).status,
    ).toBe(400);
    expect(
      (await replace(owner.cookieHeader, companyId, [{ label: "Name", is_required: "yes" }])).status,
    ).toBe(400);
    expect(
      (await replace(
        owner.cookieHeader,
        companyId,
        Array.from({ length: 31 }, (_, i) => ({ label: `Q${i}` })),
      )).status,
    ).toBe(400);
  });

  it("a member can replace, list, and clear the set — order and required round-trip", async () => {
    const owner = await signUpTestUser("owner");
    const member = await signUpTestUser("member");
    const companyId = await createCompany(owner.cookieHeader, "CRUD Intake Co");
    await addMember(owner.cookieHeader, companyId, member.userId);

    const saved = await replace(member.cookieHeader, companyId, [
      { label: "  Full name  ", is_required: true },
      { label: "Age", is_required: false },
      { label: "CPF", is_required: true },
    ]);
    expect(saved.status).toBe(200);
    expect(saved.json.intakeFields.map((f) => [f.label, f.is_required, f.position])).toEqual([
      ["Full name", true, 0], // trimmed, position from array order
      ["Age", false, 1],
      ["CPF", true, 2],
    ]);

    const fetched = await list(member.cookieHeader, companyId);
    expect(fetched.json.intakeFields.map((f) => f.label)).toEqual(["Full name", "Age", "CPF"]);

    // A second PUT is a full replace, not a merge — old rows are gone.
    const reordered = await replace(member.cookieHeader, companyId, [
      { label: "Phone number", is_required: true },
      { label: "Full name", is_required: true },
    ]);
    expect(reordered.json.intakeFields.map((f) => [f.label, f.position])).toEqual([
      ["Phone number", 0],
      ["Full name", 1],
    ]);

    // is_required defaults to false when omitted.
    const defaulted = await replace(member.cookieHeader, companyId, [{ label: "Notes" }]);
    expect(defaulted.json.intakeFields[0].is_required).toBe(false);

    const cleared = await replace(member.cookieHeader, companyId, []);
    expect(cleared.status).toBe(200);
    expect(cleared.json.intakeFields).toEqual([]);
    expect((await list(member.cookieHeader, companyId)).json.intakeFields).toEqual([]);
  });
});
