import "server-only";
import { buildCapiEvent, type CapiEventInput } from "./capi-event";
import { META_PIXEL_ID } from "./pixel";

const GRAPH_API_BASE_URL = process.env.META_GRAPH_API_BASE_URL ?? "https://graph.facebook.com";
const GRAPH_API_VERSION = "v21.0";

// Server-side copy of a pixel event, for the browsers the pixel can't reach
// (Instagram's in-app browser, iOS tracking protection, blockers). Best
// effort: without `META_CAPI_ACCESS_TOKEN` it does nothing, and a failure is
// logged, never thrown -- tracking must never break a sign-up.
// `META_CAPI_TEST_EVENT_CODE` routes events to Events Manager's "Test events"
// tab instead of the live dataset.
export async function sendCapiEvent(input: CapiEventInput): Promise<void> {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) return;

  const testCode = process.env.META_CAPI_TEST_EVENT_CODE;
  const url = `${GRAPH_API_BASE_URL}/${GRAPH_API_VERSION}/${META_PIXEL_ID}/events`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: token,
        data: [buildCapiEvent(input)],
        ...(testCode ? { test_event_code: testCode } : {}),
      }),
    });
    if (!res.ok) {
      console.error("[meta-capi] event rejected", { status: res.status, body: await res.text() });
    }
  } catch (error) {
    console.error("[meta-capi] event failed", { message: (error as Error).message });
  }
}
