import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { getTestEnv } from "./helpers/env";
import { signUpTestUser } from "./helpers/auth";

// Embed widget customization -- POST /api/companies/:id/agents/:slug/widget.
// Raw fetch + FormData (not the shared `api()` helper, which always
// JSON-stringifies) since this endpoint expects multipart/form-data, same
// reasoning as products-import.test.ts.

interface CompanyAgentResult {
  companyAgent?: {
    widget_greeting: string | null;
    widget_launcher_type: string;
    widget_launcher_asset_url: string | null;
  };
  error?: string;
}

async function createCompany(ownerCookie: string, name: string) {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
  return created.json.company.id;
}

async function hireMalu(ownerCookie: string, companyId: string) {
  await api("POST", `/api/companies/${companyId}/agents/malu`, ownerCookie);
}

async function saveWidget(
  cookie: string | undefined,
  companyId: string,
  fields: { launcherType: string; greeting?: string; file?: File },
): Promise<{ status: number; json: CompanyAgentResult }> {
  const { baseUrl } = getTestEnv();
  const formData = new FormData();
  formData.set("launcherType", fields.launcherType);
  formData.set("greeting", fields.greeting ?? "");
  if (fields.file) formData.set("file", fields.file);

  const res = await fetch(`${baseUrl}/api/companies/${companyId}/agents/malu/widget`, {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
    body: formData,
  });
  const json = (await res.json().catch(() => ({}))) as CompanyAgentResult;
  return { status: res.status, json };
}

// A real, tiny valid PNG (1x1 transparent pixel) -- large enough to exercise
// real Storage upload/public-read, small enough to stay well under the 2MB
// image cap.
const TINY_PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
function pngFile(name = "launcher.png") {
  return new File([TINY_PNG_BYTES], name, { type: "image/png" });
}

describe("Widget customization POST /api/companies/:id/agents/malu/widget", () => {
  it("requires authentication and membership", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Widget Auth Co");
    await hireMalu(owner.cookieHeader, companyId);

    expect((await saveWidget(undefined, companyId, { launcherType: "default" })).status).toBe(401);
    expect((await saveWidget(outsider.cookieHeader, companyId, { launcherType: "default" })).status).toBe(403);
  });

  it("404s when the agent hasn't been hired", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Widget Not Hired Co");

    const result = await saveWidget(owner.cookieHeader, companyId, { launcherType: "default" });
    expect(result.status).toBe(404);
  });

  it("rejects an invalid launcherType", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Widget Bad Type Co");
    await hireMalu(owner.cookieHeader, companyId);

    const result = await saveWidget(owner.cookieHeader, companyId, { launcherType: "gif_of_a_dog" });
    expect(result.status).toBe(400);
  });

  it("saves a greeting with the default launcher and no file", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Widget Default Co");
    await hireMalu(owner.cookieHeader, companyId);

    const result = await saveWidget(owner.cookieHeader, companyId, {
      launcherType: "default",
      greeting: "Need help finding a gift?",
    });
    expect(result.status).toBe(200);
    expect(result.json.companyAgent?.widget_greeting).toBe("Need help finding a gift?");
    expect(result.json.companyAgent?.widget_launcher_type).toBe("default");
    expect(result.json.companyAgent?.widget_launcher_asset_url).toBeNull();
  });

  it("rejects choosing a custom launcher with no file and nothing previously saved", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Widget No File Co");
    await hireMalu(owner.cookieHeader, companyId);

    const result = await saveWidget(owner.cookieHeader, companyId, { launcherType: "image" });
    expect(result.status).toBe(400);
  });

  it("rejects an oversized or wrong-type file", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Widget Bad File Co");
    await hireMalu(owner.cookieHeader, companyId);

    const wrongType = new File([TINY_PNG_BYTES], "launcher.png", { type: "application/pdf" });
    const wrongTypeResult = await saveWidget(owner.cookieHeader, companyId, {
      launcherType: "image",
      file: wrongType,
    });
    expect(wrongTypeResult.status).toBe(400);

    const oversized = new File([new Uint8Array(3 * 1024 * 1024)], "launcher.png", { type: "image/png" });
    const oversizedResult = await saveWidget(owner.cookieHeader, companyId, {
      launcherType: "image",
      file: oversized,
    });
    expect(oversizedResult.status).toBe(400);
  });

  it("uploads a real image to a publicly-fetchable URL, then replaces and reverts it", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Widget Upload Co");
    await hireMalu(owner.cookieHeader, companyId);

    const first = await saveWidget(owner.cookieHeader, companyId, {
      launcherType: "image",
      greeting: "Hi there",
      file: pngFile("first.png"),
    });
    expect(first.status).toBe(200);
    const firstUrl = first.json.companyAgent?.widget_launcher_asset_url;
    expect(firstUrl).toMatch(/^https?:\/\/.+widget-assets\//);

    // Publicly fetchable with no auth -- the whole point of the bucket being
    // public, since this URL ends up embedded on an arbitrary third-party
    // storefront with no Staffra session.
    const publicFetch = await fetch(firstUrl!);
    expect(publicFetch.status).toBe(200);

    // Replacing it swaps the URL and the old object stops resolving.
    const second = await saveWidget(owner.cookieHeader, companyId, {
      launcherType: "image",
      greeting: "Hi there",
      file: pngFile("second.png"),
    });
    expect(second.status).toBe(200);
    const secondUrl = second.json.companyAgent?.widget_launcher_asset_url;
    expect(secondUrl).not.toBe(firstUrl);

    const oldStillThere = await fetch(firstUrl!);
    expect(oldStillThere.status).not.toBe(200);

    // Reverting to default clears the asset url and cleans up the object.
    const reverted = await saveWidget(owner.cookieHeader, companyId, { launcherType: "default" });
    expect(reverted.status).toBe(200);
    expect(reverted.json.companyAgent?.widget_launcher_asset_url).toBeNull();

    const revertedStillThere = await fetch(secondUrl!);
    expect(revertedStillThere.status).not.toBe(200);
  });

  it("keeps the existing asset when re-saving the same launcher type without a new file", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Widget Keep Asset Co");
    await hireMalu(owner.cookieHeader, companyId);

    const uploaded = await saveWidget(owner.cookieHeader, companyId, {
      launcherType: "image",
      file: pngFile(),
    });
    const assetUrl = uploaded.json.companyAgent?.widget_launcher_asset_url;

    const resaved = await saveWidget(owner.cookieHeader, companyId, {
      launcherType: "image",
      greeting: "Updated greeting only",
    });
    expect(resaved.status).toBe(200);
    expect(resaved.json.companyAgent?.widget_launcher_asset_url).toBe(assetUrl);
    expect(resaved.json.companyAgent?.widget_greeting).toBe("Updated greeting only");
  });

  it("saves the mascot launcher (BETA) with no file, and switching to it clears a previous upload", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Widget Mascot Co");
    await hireMalu(owner.cookieHeader, companyId);

    // Upload an image first so there's an asset that should be cleared.
    const uploaded = await saveWidget(owner.cookieHeader, companyId, {
      launcherType: "image",
      file: pngFile(),
    });
    expect(uploaded.json.companyAgent?.widget_launcher_asset_url).toBeTruthy();

    const mascot = await saveWidget(owner.cookieHeader, companyId, {
      launcherType: "mascot",
      greeting: "Precisa de ajuda?",
    });
    expect(mascot.status).toBe(200);
    expect(mascot.json.companyAgent?.widget_launcher_type).toBe("mascot");
    // Bundled asset -- no upload, no stored URL, exactly like "default".
    expect(mascot.json.companyAgent?.widget_launcher_asset_url).toBeNull();
    expect(mascot.json.companyAgent?.widget_greeting).toBe("Precisa de ajuda?");
  });
});
