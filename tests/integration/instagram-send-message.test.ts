import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startInstagramApiMock } from "./helpers/instagram-api-mock";

// Trello N5. sendInstagramMessage is only reachable through the webhook
// route (instagram-webhook.test.ts) after a real AgentEngine.run() call --
// which needs a real OPENAI_API_KEY this suite doesn't have (see that
// file's own comment). Rather than leave N5's retry/tokenInvalid logic
// completely untested, this file imports it directly against its own
// locally-started mock -- no spawned Next server, no global-setup fixture,
// genuinely independent of the OpenAI gap. process.env is set BEFORE the
// dynamic import specifically because meta-instagram-api.ts reads
// INSTAGRAM_GRAPH_BASE_URL into a module-level const at import time; a
// static top-of-file import would already have run before this file's own
// code gets a chance to set the env var.
describe("sendInstagramMessage (N5)", () => {
  let mock: Awaited<ReturnType<typeof startInstagramApiMock>>;
  let sendInstagramMessage: typeof import("@/lib/instagram/meta-instagram-api").sendInstagramMessage;

  beforeAll(async () => {
    mock = await startInstagramApiMock();
    process.env.INSTAGRAM_GRAPH_BASE_URL = mock.url;
    ({ sendInstagramMessage } = await import("@/lib/instagram/meta-instagram-api"));
  });

  afterAll(async () => {
    await mock.stop();
  });

  it("succeeds against a normal recipient", async () => {
    const result = await sendInstagramMessage("token", "our-ig-id", "a-real-customer", "Hello!");
    expect(result).toEqual({ ok: true });
  });

  it("doesn't error on text longer than Instagram's 2000-character limit", async () => {
    // Proves the call survives an oversized reply rather than failing --
    // the mock doesn't echo back what it received, so the actual
    // truncation-to-2000 is exercised here but only verified by reading
    // sendInstagramMessage's own source, not asserted independently.
    const result = await sendInstagramMessage("token", "our-ig-id", "a-real-customer", "x".repeat(5000));
    expect(result).toEqual({ ok: true });
  });

  it("reports tokenInvalid on a 401 (dead/revoked token), no retry needed", async () => {
    const result = await sendInstagramMessage("token", "our-ig-id", "trigger-send-unauthorized", "hi");
    expect(result).toEqual({ ok: false, tokenInvalid: true });
  });

  it("retries once on a 5xx and reports a non-token failure once that also fails", async () => {
    const result = await sendInstagramMessage("token", "our-ig-id", "trigger-send-failure", "hi");
    expect(result).toEqual({ ok: false, tokenInvalid: false });
  });
});
