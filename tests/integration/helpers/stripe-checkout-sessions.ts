import { getTestEnv } from "./env";
import type { CapturedCheckoutSession, CapturedPortalSession } from "./stripe-api-mock";

// Reads / clears the checkout-session `subscription_data` the mock Stripe
// server (global-setup.ts) captured. The spawned next-dev process is what
// actually calls the mock; tests read back through here -- same inspection
// shape as helpers/google-calendar-events.ts.

export async function capturedCheckoutSessions(): Promise<CapturedCheckoutSession[]> {
  const res = await fetch(`${getTestEnv().stripeApiMockUrl}/__checkout_sessions`);
  return (await res.json()) as CapturedCheckoutSession[];
}

export async function clearCapturedCheckoutSessions(): Promise<void> {
  await fetch(`${getTestEnv().stripeApiMockUrl}/__checkout_sessions`, { method: "DELETE" });
}

// Extracts the mock session id from the checkout URL the route returns
// (`https://checkout.stripe.test/c/<id>`), so a test only needs the API
// response, not a second lookup mechanism.
export function sessionIdFromCheckoutUrl(url: string): string {
  return url.split("/").pop()!;
}

export async function capturedCheckoutSession(
  url: string,
): Promise<CapturedCheckoutSession | undefined> {
  const id = sessionIdFromCheckoutUrl(url);
  return (await capturedCheckoutSessions()).find((s) => s.id === id);
}

// Same idea for Billing Portal sessions: the flow_data the route sent
// (`https://billing.stripe.test/p/session/<id>`).
export async function capturedPortalSession(url: string): Promise<CapturedPortalSession | undefined> {
  const id = url.split("/").pop()!;
  const res = await fetch(`${getTestEnv().stripeApiMockUrl}/__portal_sessions`);
  return ((await res.json()) as CapturedPortalSession[]).find((s) => s.id === id);
}
