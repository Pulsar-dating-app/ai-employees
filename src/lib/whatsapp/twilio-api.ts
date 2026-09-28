import type { SendWhatsappMessageResult } from "@/lib/whatsapp/meta-graph-api";

const TWILIO_API_BASE_URL = process.env.TWILIO_API_BASE_URL ?? "https://api.twilio.com";
const TWILIO_MESSAGING_API_BASE_URL = process.env.TWILIO_MESSAGING_API_BASE_URL ?? "https://messaging.twilio.com";

export const TWILIO_WHATSAPP_WEBHOOK_PATH = "/api/webhooks/twilio/whatsapp";

export type TwilioCredentials = { accountSid: string; authToken: string };

export type TwilioSender = { sid: string; status: string; senderId: string };

export const TWILIO_SENDER_ONLINE = "ONLINE";
export const TWILIO_SENDER_PENDING_VERIFICATION = "PENDING_VERIFICATION";
export const TWILIO_SENDER_OFFLINE = "OFFLINE";

export function parentTwilioCredentials(): TwilioCredentials {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) throw new Error("TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN are not set");
  return { accountSid, authToken };
}

export function toWhatsappSenderId(displayPhoneNumber: string): string {
  const digits = displayPhoneNumber.replace(/\D/g, "");
  if (!digits) throw new Error("Cannot build a WhatsApp sender id from an empty phone number");
  return `whatsapp:+${digits}`;
}

function authHeader({ accountSid, authToken }: TwilioCredentials) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

function toSender(json: { sid?: string; status?: string; sender_id?: string }): TwilioSender {
  if (!json.sid || !json.status || !json.sender_id) throw new Error("Twilio returned an incomplete sender");
  return { sid: json.sid, status: json.status, senderId: json.sender_id };
}

export async function createSubaccount(friendlyName: string): Promise<TwilioCredentials> {
  const parent = parentTwilioCredentials();
  const res = await fetch(`${TWILIO_API_BASE_URL}/2010-04-01/Accounts.json`, {
    method: "POST",
    headers: { Authorization: authHeader(parent), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ FriendlyName: friendlyName }),
  });
  if (!res.ok) throw new Error(`Twilio subaccount creation failed: ${await res.text()}`);
  const { sid, auth_token: authToken } = (await res.json()) as { sid?: string; auth_token?: string };
  if (!sid || !authToken) throw new Error("Twilio subaccount creation returned no credentials");
  return { accountSid: sid, authToken };
}

export async function createWhatsappSender(
  credentials: TwilioCredentials,
  input: { senderId: string; wabaId: string; callbackUrl: string },
): Promise<TwilioSender> {
  const res = await fetch(`${TWILIO_MESSAGING_API_BASE_URL}/v2/Channels/Senders`, {
    method: "POST",
    headers: { Authorization: authHeader(credentials), "content-type": "application/json" },
    body: JSON.stringify({
      sender_id: input.senderId,
      configuration: { waba_id: input.wabaId, account_type: "ISVSubAccount" },
      webhook: { callback_url: input.callbackUrl, callback_method: "POST" },
    }),
  });
  if (!res.ok) throw new Error(`Twilio sender creation failed: ${await res.text()}`);
  return toSender(await res.json());
}

export async function fetchWhatsappSender(credentials: TwilioCredentials, senderSid: string): Promise<TwilioSender> {
  const res = await fetch(`${TWILIO_MESSAGING_API_BASE_URL}/v2/Channels/Senders/${senderSid}`, {
    headers: { Authorization: authHeader(credentials) },
  });
  if (!res.ok) throw new Error(`Twilio sender lookup failed: ${await res.text()}`);
  return toSender(await res.json());
}

export async function submitWhatsappSenderVerificationCode(
  credentials: TwilioCredentials,
  senderSid: string,
  verificationCode: string,
): Promise<TwilioSender> {
  const res = await fetch(`${TWILIO_MESSAGING_API_BASE_URL}/v2/Channels/Senders/${senderSid}`, {
    method: "POST",
    headers: { Authorization: authHeader(credentials), "content-type": "application/json" },
    body: JSON.stringify({ configuration: { verification_code: verificationCode } }),
  });
  if (!res.ok) throw new Error(`Twilio sender verification failed: ${await res.text()}`);
  return toSender(await res.json());
}

export async function deleteWhatsappSender(credentials: TwilioCredentials, senderSid: string): Promise<void> {
  const res = await fetch(`${TWILIO_MESSAGING_API_BASE_URL}/v2/Channels/Senders/${senderSid}`, {
    method: "DELETE",
    headers: { Authorization: authHeader(credentials) },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Twilio sender deletion failed: ${await res.text()}`);
}

export async function sendTwilioWhatsappMessage(
  credentials: TwilioCredentials,
  senderId: string,
  customerPhone: string,
  text: string,
): Promise<SendWhatsappMessageResult> {
  const body = new URLSearchParams({ From: senderId, To: `whatsapp:+${customerPhone.replace(/^\+/, "")}`, Body: text });

  const attempt = () =>
    fetch(`${TWILIO_API_BASE_URL}/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: authHeader(credentials), "content-type": "application/x-www-form-urlencoded" },
      body,
    });

  let res = await attempt();
  if (!res.ok && res.status >= 500) {
    res = await attempt();
  }

  if (res.ok) return { ok: true };
  if (res.status === 401 || res.status === 403) return { ok: false, kind: "token_invalid" };

  const error = (await res.json().catch(() => null)) as { code?: number; message?: string } | null;
  return {
    ok: false,
    kind: "other",
    errorDetail: error?.code ? `code ${error.code}: ${error.message ?? "Unknown Twilio error"}` : `HTTP ${res.status}`,
  };
}
