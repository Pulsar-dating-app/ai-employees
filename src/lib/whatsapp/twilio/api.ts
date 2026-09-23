import { addressFromCustomerPhone, toChannelAddress } from "./phone";

// Thin wrapper over the three Twilio endpoints the WhatsApp channel needs.
// Plain fetch on purpose (no `twilio` SDK): three JSON/form calls don't
// justify a dependency, and it keeps the same shape as meta-graph-api.ts.
//
//   - Accounts API  (api.twilio.com)        -- create a company's subaccount
//   - Senders API v2 (messaging.twilio.com) -- register/read/delete a
//     WhatsApp sender inside that subaccount
//   - Messages API  (api.twilio.com)        -- send a WhatsApp message
//
// TWILIO_API_BASE_URL / TWILIO_MESSAGING_BASE_URL let the integration tests
// point these at a local mock (the spawned Next.js server can't share an
// in-process fetch mock with the test runner -- see tests/integration/
// global-setup.ts). Read per call, not at import, so tests and scripts can
// override them.
function apiBase() {
  return process.env.TWILIO_API_BASE_URL ?? "https://api.twilio.com";
}
function messagingBase() {
  return process.env.TWILIO_MESSAGING_BASE_URL ?? "https://messaging.twilio.com";
}

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
}

// The parent (Staffra) account -- only used to create subaccounts. Every
// other call authenticates as the company's own subaccount.
export function getParentCredentials(): TwilioCredentials {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not configured");
  return { accountSid, authToken };
}

function basicAuth({ accountSid, authToken }: TwilioCredentials) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

// Twilio's error envelope: { code, message, more_info, status }.
export class TwilioApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly code: number | null,
    message: string,
  ) {
    super(message);
    this.name = "TwilioApiError";
  }
}

async function toApiError(res: Response): Promise<TwilioApiError> {
  let code: number | null = null;
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as { code?: unknown; message?: unknown };
    if (typeof body.code === "number") code = body.code;
    if (typeof body.message === "string") message = body.message;
  } catch {
    // Not JSON -- keep the HTTP status as the message.
  }
  return new TwilioApiError(res.status, code, message);
}

// ---------------------------------------------------------------------------
// Subaccounts
// ---------------------------------------------------------------------------

export async function createSubaccount(friendlyName: string): Promise<{ sid: string; authToken: string }> {
  const res = await fetch(`${apiBase()}/2010-04-01/Accounts.json`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(getParentCredentials()),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ FriendlyName: friendlyName }),
  });
  if (!res.ok) throw await toApiError(res);
  const body = (await res.json()) as { sid?: string; auth_token?: string };
  if (!body.sid || !body.auth_token) throw new Error("Twilio subaccount creation returned no sid/auth_token");
  return { sid: body.sid, authToken: body.auth_token };
}

// ---------------------------------------------------------------------------
// Senders (Senders API v2)
// ---------------------------------------------------------------------------

export interface TwilioSender {
  sid: string;
  // Raw Twilio status: CREATING, ONLINE, OFFLINE, ... Anything that isn't
  // ONLINE can't send yet (or any more).
  status: string;
  qualityRating: string | null;
  messagingLimit: string | null;
}

function parseSender(body: unknown): TwilioSender {
  const sender = body as {
    sid?: string;
    status?: string;
    properties?: { quality_rating?: string; messaging_limit?: string };
    quality_rating?: string;
    messaging_limit?: string;
  };
  if (!sender.sid) throw new Error("Twilio sender response had no sid");
  return {
    sid: sender.sid,
    status: sender.status ?? "UNKNOWN",
    qualityRating: sender.properties?.quality_rating ?? sender.quality_rating ?? null,
    messagingLimit: sender.properties?.messaging_limit ?? sender.messaging_limit ?? null,
  };
}

export async function createSender(
  credentials: TwilioCredentials,
  input: {
    phoneE164: string;
    wabaId: string;
    displayName: string;
    webhookUrl: string;
    statusCallbackUrl: string;
  },
): Promise<TwilioSender> {
  const res = await fetch(`${messagingBase()}/v2/Channels/Senders`, {
    method: "POST",
    headers: { Authorization: basicAuth(credentials), "content-type": "application/json" },
    body: JSON.stringify({
      sender_id: toChannelAddress(input.phoneE164),
      // The WABA the merchant just created in Embedded Signup -- the number
      // was already OTP-verified there, so no verification_method here.
      configuration: { waba_id: input.wabaId },
      webhook: {
        callback_url: input.webhookUrl,
        callback_method: "POST",
        status_callback_url: input.statusCallbackUrl,
        status_callback_method: "POST",
      },
      profile: { name: input.displayName },
    }),
  });
  if (!res.ok) throw await toApiError(res);
  return parseSender(await res.json());
}

export async function fetchSender(credentials: TwilioCredentials, senderSid: string): Promise<TwilioSender> {
  const res = await fetch(`${messagingBase()}/v2/Channels/Senders/${senderSid}`, {
    headers: { Authorization: basicAuth(credentials) },
  });
  if (!res.ok) throw await toApiError(res);
  return parseSender(await res.json());
}

// A sender that is already gone (404) is the desired end state, not a
// failure.
export async function deleteSender(credentials: TwilioCredentials, senderSid: string): Promise<void> {
  const res = await fetch(`${messagingBase()}/v2/Channels/Senders/${senderSid}`, {
    method: "DELETE",
    headers: { Authorization: basicAuth(credentials) },
  });
  if (!res.ok && res.status !== 404) throw await toApiError(res);
}

// ONLINE is the only state that can send. Everything else -- CREATING while
// Meta reviews the display name, OFFLINE while (re)connecting -- is
// "not live yet".
export function isSenderOnline(sender: Pick<TwilioSender, "status">): boolean {
  return sender.status.toUpperCase() === "ONLINE";
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

// Twilio error 63016: "Failed to send freeform message because you are
// outside the allowed window" -- the 24h customer-service window closed, and
// only an approved template can go out now.
export const OUTSIDE_WINDOW_ERROR_CODE = 63016;
// 63007: Twilio couldn't find a channel (sender) for the From address -- the
// sender was deleted or is not registered/online.
export const SENDER_NOT_FOUND_ERROR_CODE = 63007;
// 20003: authentication failed -- the subaccount was suspended or its token
// rotated. Account-level: every send for this company will fail the same way.
const AUTH_FAILED_ERROR_CODE = 20003;

export type SendWhatsappMessageResult =
  | { ok: true; messageSid: string }
  // outside_window: the customer hasn't written in 24h -- not retryable and
  //   not our fault; the human-takeover UI tells the merchant.
  // sender_offline: the sender is gone / not live -- the caller should re-sync
  //   its status rather than keep sending.
  // account_problem: 401/403 or auth failure on the company's subaccount --
  //   needs Staffra's attention (suspended account, rotated token), never the
  //   merchant's.
  // other: anything else (network blip, a 4xx not listed, a 5xx that failed
  //   both attempts). `errorDetail` is for server-side logs only -- never
  //   shown to a merchant.
  | { ok: false; kind: "outside_window" | "sender_offline" | "account_problem" }
  | { ok: false; kind: "other"; errorDetail?: string };

export async function sendWhatsappMessage(
  credentials: TwilioCredentials,
  input: {
    fromE164: string;
    // The customer's digits-only phone (customers.phone).
    toPhone: string;
    text: string;
    statusCallbackUrl?: string;
  },
): Promise<SendWhatsappMessageResult> {
  const form = new URLSearchParams({
    From: toChannelAddress(input.fromE164),
    To: addressFromCustomerPhone(input.toPhone),
    Body: input.text,
  });
  if (input.statusCallbackUrl) form.set("StatusCallback", input.statusCallbackUrl);

  const attempt = () =>
    fetch(`${apiBase()}/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: basicAuth(credentials), "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });

  let res: Response;
  try {
    res = await attempt();
    // Retry once on a transient failure only -- a 4xx fails identically.
    if (!res.ok && res.status >= 500) res = await attempt();
  } catch (err) {
    return { ok: false, kind: "other", errorDetail: err instanceof Error ? err.message : "network error" };
  }

  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { sid?: string };
    return { ok: true, messageSid: body.sid ?? "" };
  }

  const error = await toApiError(res);
  if (error.code === OUTSIDE_WINDOW_ERROR_CODE) return { ok: false, kind: "outside_window" };
  if (error.code === SENDER_NOT_FOUND_ERROR_CODE) return { ok: false, kind: "sender_offline" };
  if (error.httpStatus === 401 || error.httpStatus === 403 || error.code === AUTH_FAILED_ERROR_CODE) {
    return { ok: false, kind: "account_problem" };
  }
  return {
    ok: false,
    kind: "other",
    errorDetail: `${error.code ? `code ${error.code}: ` : ""}${error.message}`,
  };
}
