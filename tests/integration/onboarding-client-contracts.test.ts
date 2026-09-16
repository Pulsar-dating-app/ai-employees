import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { signUpTestUser, type TestUser } from "./helpers/auth";
import { seedActivePlan } from "./helpers/billing";
import {
  DEFAULT_OPEN_DAYS,
  DEFAULT_OPEN_FROM,
  DEFAULT_OPEN_TO,
  SERVICE_PRESETS,
} from "@/lib/appointments/service-presets";

// The onboarding steps do their real work from the browser, so the page
// rendering proves nothing about whether those calls succeed. Three bugs got
// through that gap in one sitting -- a wrong body key (`hours` for
// `businessHours`), and reading `inserted_count` off a response that returns
// `insertedCount` -- each one a silent failure at the exact moment the flow is
// supposed to feel effortless. These assert the request shapes the client
// sends and the response shapes it reads, against the real routes.
describe("Onboarding client-to-API contracts", () => {
  async function company(user: TestUser) {
    const created = await api<{ company: { id: string } }>("POST", "/api/companies", user.cookieHeader, {
      name: `Contract Co ${randomUUID().slice(0, 8)}`,
    });
    return created.json.company.id;
  }

  it("creates services with exactly the body ServicesSetup sends", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await company(owner);

    for (const preset of SERVICE_PRESETS.salon) {
      const res = await api<{ service: { id: string } }>(
        "POST",
        `/api/companies/${companyId}/services`,
        owner.cookieHeader,
        { name: `Serviço ${preset.key}`, duration_minutes: preset.durationMinutes },
      );
      expect(res.status, `creating ${preset.key}`).toBe(201);
    }
  });

  it("saves business hours with exactly the body ServicesSetup sends", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await company(owner);

    const res = await api(
      "PUT",
      `/api/companies/${companyId}/business-hours`,
      owner.cookieHeader,
      {
        businessHours: [...DEFAULT_OPEN_DAYS].map((day) => ({
          day_of_week: day,
          start_time: DEFAULT_OPEN_FROM,
          end_time: DEFAULT_OPEN_TO,
        })),
      },
    );
    expect(res.status).toBe(200);

    const saved = await api<{ businessHours: { day_of_week: number }[] }>(
      "GET",
      `/api/companies/${companyId}/business-hours`,
      owner.cookieHeader,
    );
    expect(saved.json.businessHours).toHaveLength(DEFAULT_OPEN_DAYS.length);
  });

  it("rejects the body shape that silently failed in the flow", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await company(owner);

    const wrongKey = await api("PUT", `/api/companies/${companyId}/business-hours`, owner.cookieHeader, {
      hours: [{ day_of_week: 1, start_time: "09:00", end_time: "18:00" }],
    });
    expect(wrongKey.status).toBe(400);
  });

  it("reports the import job in the shape CatalogSetup reads", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await company(owner);
    await seedActivePlan(companyId);

    const csv = "name,price,currency\nCamiseta Tie Dye,51.79,BRL\nCamiseta Lisa,39.90,BRL\n";
    const form = new FormData();
    form.append("file", new File([csv], "catalogo.csv", { type: "text/csv" }));

    const { baseUrl } = await import("./helpers/env").then((m) => m.getTestEnv());
    const upload = await fetch(`${baseUrl}/api/companies/${companyId}/products/import`, {
      method: "POST",
      headers: { cookie: owner.cookieHeader },
      body: form,
    });
    expect(upload.status).toBe(200);

    // The keys CatalogSetup destructures off the upload response.
    const body = (await upload.json()) as { queued: number; skippedCount: number };
    expect(body.queued).toBe(2);
    expect(body.skippedCount).toBe(0);

    // ...and the ones it polls for, which are camelCase, not column names.
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 400));
      const status = await api<{ job: { status: string; insertedCount: number | null } | null }>(
        "GET",
        `/api/companies/${companyId}/products/import/status`,
        owner.cookieHeader,
      );
      const job = status.json.job;
      if (job?.status === "succeeded") {
        expect(job).toHaveProperty("insertedCount");
        expect(job.insertedCount).toBe(2);
        return;
      }
    }
    throw new Error("import job never reported success");
  });
});
