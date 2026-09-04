import { describe, expect, it } from "vitest";
import { parseGraphApiError, PAYMENT_ISSUE_ERROR_CODE } from "@/lib/whatsapp/meta-graph-api";

// Trello D4/D5. Nothing in this codebase parsed Meta's Graph API error
// envelope before this -- every existing call just stringified the raw
// response body. This is the first thing that needs to branch on a
// specific `error.code`, not just success/failure.

function jsonResponse(body: unknown, status = 400) {
  return new Response(JSON.stringify(body), { status });
}

describe("parseGraphApiError", () => {
  it("parses a well-formed Graph API error envelope", async () => {
    const res = jsonResponse({ error: { code: 131042, error_subcode: 2593109, message: "Business Eligibility Payment Issue" } });
    expect(await parseGraphApiError(res)).toEqual({
      code: 131042,
      errorSubcode: 2593109,
      message: "Business Eligibility Payment Issue",
    });
  });

  it("matches PAYMENT_ISSUE_ERROR_CODE for a 131042 envelope", async () => {
    const res = jsonResponse({ error: { code: PAYMENT_ISSUE_ERROR_CODE, message: "payment issue" } });
    const parsed = await parseGraphApiError(res);
    expect(parsed?.code).toBe(PAYMENT_ISSUE_ERROR_CODE);
  });

  it("returns null for a body with no error envelope", async () => {
    expect(await parseGraphApiError(jsonResponse({ ok: false }))).toBeNull();
  });

  it("returns null for a body whose error has no numeric code", async () => {
    expect(await parseGraphApiError(jsonResponse({ error: { message: "no code here" } }))).toBeNull();
  });

  it("returns null for a non-JSON body instead of throwing", async () => {
    const res = new Response("not json", { status: 500 });
    expect(await parseGraphApiError(res)).toBeNull();
  });
});
