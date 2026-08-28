import { randomBytes } from "node:crypto";

// Trello ticket C4 -- the tracking-link primitives behind spec §14's
// `sidde.link/c/{tracking-id}`. Kept separate from the agent tool that mints
// links so E1 (the redirect service that resolves them) can share the URL
// shape without importing anything agent-engine-related.
//
// Resolved during C4: `sidde.link` is a path on the main app, not a separate
// domain -- so a link is `{base}/c/{trackingId}` and E1 is just a route in
// this Next.js app. A real short domain can be put in front of that later as
// a redirect without changing a single stored row.

export const CHECKOUT_LINK_PATH_PREFIX = "/c";

// 8 random bytes -> 11 URL-safe base64 chars (~64 bits). Deliberately
// crypto-random, not Math.random(): this id is the only thing guarding a
// public URL, and a guessable one would let anyone forge click events for a
// merchant. (The Math.random() in whatsapp/meta-graph-api.ts is fine for a
// registration PIN, which is never a security boundary -- this is.)
const TRACKING_ID_BYTES = 8;

export function generateTrackingId(): string {
  return randomBytes(TRACKING_ID_BYTES).toString("base64url");
}

export class CheckoutBaseUrlMissingError extends Error {
  constructor() {
    super(
      "SIDDE_CHECKOUT_BASE_URL is not set. Checkout links would point at localhost, " +
        "which would be sent to real customers over WhatsApp.",
    );
    this.name = "CheckoutBaseUrlMissingError";
  }
}

// Falls back to localhost only outside production. In production a missing
// base URL throws rather than silently texting customers a localhost link
// they can never open -- a loud config error is far cheaper than a dead link
// in a real sales conversation.
export function resolveCheckoutBaseUrl(): string {
  const configured = process.env.SIDDE_CHECKOUT_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") throw new CheckoutBaseUrlMissingError();
  return "http://localhost:3000";
}

export function buildCheckoutUrl(trackingId: string): string {
  return `${resolveCheckoutBaseUrl()}${CHECKOUT_LINK_PATH_PREFIX}/${trackingId}`;
}
