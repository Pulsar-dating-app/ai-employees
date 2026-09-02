import Stripe from "stripe";

// Server-only -- STRIPE_SECRET_KEY has no NEXT_PUBLIC_ prefix, so this must
// never be imported from client code. Shared by the billing epic (Trello P):
// Checkout Session creation (P3), the webhook handler (P4), and the Stripe
// customer portal.
//
// `apiVersion` is pinned to the version the installed `stripe` SDK is built
// against, so a dependency bump can't silently change request/response
// shapes underneath us -- move it forward deliberately, together with a
// tested SDK upgrade.
const STRIPE_API_VERSION = "2026-08-26.dahlia";

let cached: Stripe | null = null;

// Lazy singleton: the constructor doesn't hit the network, but it does read
// the env var, so building it on first use (not at module load) keeps
// importing this file cheap and lets a missing key fail at the call site
// with an actionable message instead of at bundle evaluation.
export function getStripeClient(): Stripe {
  if (cached) return cached;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "getStripeClient() called without STRIPE_SECRET_KEY set -- " +
        "check .env.local (or the deployment's environment variables).",
    );
  }

  cached = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
  return cached;
}
