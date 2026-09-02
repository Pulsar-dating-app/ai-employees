import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser } from "./helpers/auth";

// Trello K8 / R2 — appointment_intake_fields + GET/PUT
// /api/companies/:id/intake-fields. Now a typed model: a fixed predefined
// core set (email always on+required) plus free-text custom questions. PUT
// takes { predefined?, custom? } and rewrites the whole set; keys and
// positions are server-assigned. Member-level auth.
describe("Appointment intake fields — /api/companies/:id/intake-fields", () => {
  async function createCompany(ownerCookie: string, name: string) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
    return created.json.company.id;
  }

  async function addMember(ownerCookie: string, companyId: string, userId: string) {
    await api("POST", `/api/companies/${companyId}/members`, ownerCookie, { userId, role: "member" });
  }

  type FieldRow = {
    id: string;
    key: string;
    label: string;
    field_type: string;
    is_required: boolean;
    is_enabled: boolean;
    position: number;
    predefined: boolean;
  };

  function list(cookie: string | undefined, companyId: string) {
    return api<{ intakeFields: FieldRow[] }>("GET", `/api/companies/${companyId}/intake-fields`, cookie);
  }

  function put(cookie: string | undefined, companyId: string, body: unknown) {
    return api<{ intakeFields: FieldRow[] }>("PUT", `/api/companies/${companyId}/intake-fields`, cookie, body);
  }

  it("requires authentication", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Auth Check Intake Co");

    expect((await list(undefined, companyId)).status).toBe(401);
    expect((await put(undefined, companyId, { custom: [] })).status).toBe(401);
  });

  it("blocks non-members", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Members Only Intake Co");

    expect((await list(outsider.cookieHeader, companyId)).status).toBe(403);
    expect((await put(outsider.cookieHeader, companyId, { custom: [] })).status).toBe(403);
  });

  it("every new company starts with the seeded predefined set", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Seeded Intake Co");

    const res = await list(owner.cookieHeader, companyId);
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(res.json.intakeFields.map((f) => [f.key, f]));
    expect(Object.keys(byKey).sort()).toEqual(["cpf", "date_of_birth", "email", "full_name", "phone"]);
    expect(byKey.email).toMatchObject({ field_type: "email", is_enabled: true, is_required: true, predefined: true });
    expect(byKey.full_name).toMatchObject({ is_enabled: true, is_required: true });
    expect(byKey.phone).toMatchObject({ is_enabled: false, is_required: false });
  });

  it("rejects turning email off or making it optional", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Email Locked Co");

    expect(
      (await put(owner.cookieHeader, companyId, {
        predefined: [{ key: "email", is_enabled: false, is_required: false }],
      })).status,
    ).toBe(400);
    expect(
      (await put(owner.cookieHeader, companyId, {
        predefined: [{ key: "email", is_enabled: true, is_required: false }],
      })).status,
    ).toBe(400);
  });

  it("validates the payload", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Payload Intake Co");

    expect((await put(owner.cookieHeader, companyId, { custom: "nope" })).status).toBe(400);
    expect((await put(owner.cookieHeader, companyId, { custom: [{ label: "   " }] })).status).toBe(400);
    expect((await put(owner.cookieHeader, companyId, { custom: [{ label: "x".repeat(121) }] })).status).toBe(400);
    expect(
      (await put(owner.cookieHeader, companyId, { custom: [{ label: "Ok", is_required: "yes" }] })).status,
    ).toBe(400);
    expect(
      (await put(owner.cookieHeader, companyId, {
        custom: Array.from({ length: 26 }, (_, i) => ({ label: `Q${i}` })),
      })).status,
    ).toBe(400);
    expect(
      (await put(owner.cookieHeader, companyId, { predefined: [{ key: "nope", is_enabled: true, is_required: true }] }))
        .status,
    ).toBe(400);
  });

  it("a member toggles predefined fields and manages custom questions", async () => {
    const owner = await signUpTestUser("owner");
    const member = await signUpTestUser("member");
    const companyId = await createCompany(owner.cookieHeader, "CRUD Intake Co");
    await addMember(owner.cookieHeader, companyId, member.userId);

    const saved = await put(member.cookieHeader, companyId, {
      predefined: [
        { key: "email", is_enabled: true, is_required: true },
        { key: "full_name", is_enabled: true, is_required: true },
        { key: "phone", is_enabled: true, is_required: true },
        { key: "cpf", is_enabled: false, is_required: false },
        { key: "date_of_birth", is_enabled: false, is_required: false },
      ],
      custom: [
        { label: "  Motivo da consulta  ", is_required: true },
        { label: "Convênio", is_required: false },
      ],
    });
    expect(saved.status).toBe(200);

    const byKey = Object.fromEntries(saved.json.intakeFields.map((f) => [f.key, f]));
    expect(byKey.phone).toMatchObject({ is_enabled: true, is_required: true });
    expect(byKey.cpf).toMatchObject({ is_enabled: false, is_required: false });
    // custom rows: trimmed label, generated key, field_type text, ordered after predefined
    expect(byKey.motivo_da_consulta).toMatchObject({
      label: "Motivo da consulta",
      field_type: "text",
      is_required: true,
      predefined: false,
    });
    expect(saved.json.intakeFields.filter((f) => !f.predefined).map((f) => f.key)).toEqual([
      "motivo_da_consulta",
      "convenio",
    ]);

    // A second PUT fully replaces custom rows; omitting `predefined` resets them to defaults.
    const replaced = await put(member.cookieHeader, companyId, { custom: [{ label: "Alergias", is_required: true }] });
    const byKey2 = Object.fromEntries(replaced.json.intakeFields.map((f) => [f.key, f]));
    expect(byKey2.phone.is_enabled).toBe(false); // back to default
    expect(replaced.json.intakeFields.filter((f) => !f.predefined).map((f) => f.key)).toEqual(["alergias"]);

    const fetched = await list(member.cookieHeader, companyId);
    expect(fetched.json.intakeFields.filter((f) => !f.predefined).map((f) => f.label)).toEqual(["Alergias"]);
  });
});
