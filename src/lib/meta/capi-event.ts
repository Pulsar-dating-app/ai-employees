import { createHash } from "node:crypto";

// One Conversions API event, built as Meta's `/events` endpoint expects it.
// Pure, so it is unit-tested apart from the network call (conversions.ts).
// Personal data is hashed (SHA-256 of the normalised value) as Meta requires;
// `fbp` / `fbc` / IP / user agent are sent as-is, which is what Meta matches
// the ad click on.

export type CapiEventInput = {
  eventName: string;
  eventId: string;
  eventTime: Date;
  sourceUrl: string | null;
  email: string | null;
  fbp: string | null;
  fbc: string | null;
  clientIp: string | null;
  userAgent: string | null;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildCapiEvent(input: CapiEventInput) {
  const email = input.email?.trim().toLowerCase();
  const userData: Record<string, string | string[]> = {};
  if (email) userData.em = [sha256(email)];
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.userAgent) userData.client_user_agent = input.userAgent;

  return {
    event_name: input.eventName,
    event_time: Math.floor(input.eventTime.getTime() / 1000),
    event_id: input.eventId,
    action_source: "website",
    ...(input.sourceUrl ? { event_source_url: input.sourceUrl } : {}),
    user_data: userData,
  };
}

/** First address of `x-forwarded-for`, the client as the proxy saw it. */
export function clientIpFrom(forwardedFor: string | null): string | null {
  const first = forwardedFor?.split(",")[0]?.trim();
  return first ? first : null;
}
