// Meta Pixel for the ad funnel (/comecar). Client-safe: the pixel component
// and the sign-up action both import it.
//
// The pixel only fires on the production hosts, so local dev and preview
// deployments never pollute the dataset the ads optimise against.

export const META_PIXEL_ID = "2052811912105095";

// Set by the sign-up action when an account is created from /comecar. It
// carries the `event_id` shared by the browser's CompleteRegistration and the
// Conversions API one, so Meta deduplicates them into a single registration.
export const META_REGISTRATION_COOKIE = "staffra_meta_reg";
export const META_REGISTRATION_COOKIE_MAX_AGE = 60 * 60 * 24;

const TRACKED_HOSTS = new Set(["staffra.io", "www.staffra.io"]);

export function isTrackedHost(hostname: string): boolean {
  return TRACKED_HOSTS.has(hostname);
}
