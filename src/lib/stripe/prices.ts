import { getStripeClient } from "./client";

// Resolves a plan's Stripe Price from its lookup key instead of a hard-coded
// id. Price ids differ between the sandbox and the live account, but a lookup
// key is ours to name, so the same `plans.ts` works against either account --
// only STRIPE_SECRET_KEY decides which one. It also means a price change is a
// Stripe-only operation: create the new Price with `transfer_lookup_key`, and
// Checkout picks it up within the cache TTL, no deploy.
//
// Cached per server instance: the catalog changes rarely, and without a cache
// every Checkout would add a Stripe round trip. Five minutes bounds how long a
// transferred key keeps resolving to the old Price.
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { id: string; expiresAt: number }>();

export async function resolvePriceId(lookupKey: string): Promise<string> {
  const hit = cache.get(lookupKey);
  if (hit && hit.expiresAt > Date.now()) return hit.id;

  const { data } = await getStripeClient().prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = data[0];
  if (!price) {
    // Config drift: the account behind STRIPE_SECRET_KEY has no active Price
    // under this key (e.g. the live catalog wasn't created yet).
    throw new Error(`No active Stripe Price with lookup key '${lookupKey}'`);
  }
  cache.set(lookupKey, { id: price.id, expiresAt: Date.now() + TTL_MS });
  return price.id;
}
