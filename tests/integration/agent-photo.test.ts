import { describe, expect, it } from "vitest";
import { api } from "./helpers/request";
import { getTestEnv } from "./helpers/env";
import { signUpTestUser } from "./helpers/auth";

// Agent photo customization -- POST /api/companies/:id/agents/:slug/photo.
// Mirrors widget-customize.test.ts field-for-field (same FormData shape,
// same bucket-upload/cleanup behavior), adapted for photo_type's three
// values (default_1/default_2/custom, no video branch, no greeting field).

interface CompanyAgentResult {
  companyAgent?: {
    photo_type: string;
    photo_asset_url: string | null;
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

async function savePhoto(
  cookie: string | undefined,
  companyId: string,
  fields: { photoType: string; file?: File },
): Promise<{ status: number; json: CompanyAgentResult }> {
  const { baseUrl } = getTestEnv();
  const formData = new FormData();
  formData.set("photoType", fields.photoType);
  if (fields.file) formData.set("file", fields.file);

  const res = await fetch(`${baseUrl}/api/companies/${companyId}/agents/malu/photo`, {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
    body: formData,
  });
  const json = (await res.json().catch(() => ({}))) as CompanyAgentResult;
  return { status: res.status, json };
}

// A real, tiny valid PNG (1x1 transparent pixel) -- large enough to exercise
// real Storage upload/public-read, small enough to stay well under the 2MB cap.
const TINY_PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
function pngFile(name = "photo.png") {
  return new File([TINY_PNG_BYTES], name, { type: "image/png" });
}

describe("Agent photo customization POST /api/companies/:id/agents/malu/photo", () => {
  it("requires authentication and membership", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Photo Auth Co");
    await hireMalu(owner.cookieHeader, companyId);

    expect((await savePhoto(undefined, companyId, { photoType: "default_1" })).status).toBe(401);
    expect((await savePhoto(outsider.cookieHeader, companyId, { photoType: "default_1" })).status).toBe(403);
  });

  it("404s when the agent hasn't been hired", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Photo Not Hired Co");

    const result = await savePhoto(owner.cookieHeader, companyId, { photoType: "default_1" });
    expect(result.status).toBe(404);
  });

  it("rejects an invalid photoType", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Photo Bad Type Co");
    await hireMalu(owner.cookieHeader, companyId);

    const result = await savePhoto(owner.cookieHeader, companyId, { photoType: "selfie" });
    expect(result.status).toBe(400);
  });

  it("selects default_2 with no file needed", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Photo Default Co");
    await hireMalu(owner.cookieHeader, companyId);

    const result = await savePhoto(owner.cookieHeader, companyId, { photoType: "default_2" });
    expect(result.status).toBe(200);
    expect(result.json.companyAgent?.photo_type).toBe("default_2");
    expect(result.json.companyAgent?.photo_asset_url).toBeNull();
  });

  it("rejects choosing custom with no file and nothing previously saved", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Photo No File Co");
    await hireMalu(owner.cookieHeader, companyId);

    const result = await savePhoto(owner.cookieHeader, companyId, { photoType: "custom" });
    expect(result.status).toBe(400);
  });

  it("rejects an oversized or wrong-type file", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Photo Bad File Co");
    await hireMalu(owner.cookieHeader, companyId);

    const wrongType = new File([TINY_PNG_BYTES], "photo.png", { type: "application/pdf" });
    const wrongTypeResult = await savePhoto(owner.cookieHeader, companyId, {
      photoType: "custom",
      file: wrongType,
    });
    expect(wrongTypeResult.status).toBe(400);

    const oversized = new File([new Uint8Array(3 * 1024 * 1024)], "photo.png", { type: "image/png" });
    const oversizedResult = await savePhoto(owner.cookieHeader, companyId, {
      photoType: "custom",
      file: oversized,
    });
    expect(oversizedResult.status).toBe(400);
  });

  it("uploads a real photo to a publicly-fetchable URL, then replaces and reverts it", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Photo Upload Co");
    await hireMalu(owner.cookieHeader, companyId);

    const first = await savePhoto(owner.cookieHeader, companyId, {
      photoType: "custom",
      file: pngFile("first.png"),
    });
    expect(first.status).toBe(200);
    const firstUrl = first.json.companyAgent?.photo_asset_url;
    expect(firstUrl).toMatch(/^https?:\/\/.+agent-photos\//);

    // Publicly fetchable with no auth -- shown on the public /talk chat page
    // and the embeddable widget's header, neither of which has a session.
    const publicFetch = await fetch(firstUrl!);
    expect(publicFetch.status).toBe(200);

    // Replacing it swaps the URL and the old object stops resolving.
    const second = await savePhoto(owner.cookieHeader, companyId, {
      photoType: "custom",
      file: pngFile("second.png"),
    });
    expect(second.status).toBe(200);
    const secondUrl = second.json.companyAgent?.photo_asset_url;
    expect(secondUrl).not.toBe(firstUrl);

    const oldStillThere = await fetch(firstUrl!);
    expect(oldStillThere.status).not.toBe(200);

    // Reverting to a default clears the asset url and cleans up the object.
    const reverted = await savePhoto(owner.cookieHeader, companyId, { photoType: "default_1" });
    expect(reverted.status).toBe(200);
    expect(reverted.json.companyAgent?.photo_asset_url).toBeNull();

    const revertedStillThere = await fetch(secondUrl!);
    expect(revertedStillThere.status).not.toBe(200);
  });

  it("keeps the existing asset when re-saving custom without a new file", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Photo Keep Asset Co");
    await hireMalu(owner.cookieHeader, companyId);

    const uploaded = await savePhoto(owner.cookieHeader, companyId, {
      photoType: "custom",
      file: pngFile(),
    });
    const assetUrl = uploaded.json.companyAgent?.photo_asset_url;

    const resaved = await savePhoto(owner.cookieHeader, companyId, { photoType: "custom" });
    expect(resaved.status).toBe(200);
    expect(resaved.json.companyAgent?.photo_asset_url).toBe(assetUrl);
  });
});
