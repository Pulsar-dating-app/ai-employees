import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handleInboundWhatsappMessage } from "@/lib/whatsapp/inbound";
import { sendTwilioWhatsappMessage, TWILIO_WHATSAPP_WEBHOOK_PATH } from "@/lib/whatsapp/twilio-api";
import { verifyTwilioSignature } from "@/lib/whatsapp/twilio-signature";
import { findTwilioSubaccount } from "@/lib/whatsapp/twilio-subaccounts";
import { resolveCheckoutBaseUrl } from "@/lib/checkout/links";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twimlResponse() {
  return new NextResponse(EMPTY_TWIML, { status: 200, headers: { "content-type": "text/xml" } });
}

export async function POST(request: Request) {
  const params = new URLSearchParams(await request.text());
  const accountSid = params.get("AccountSid");
  if (!accountSid) return new NextResponse(null, { status: 403 });

  const supabase = createServiceClient();
  const subaccount = await findTwilioSubaccount(supabase, accountSid);
  const webhookUrl = `${resolveCheckoutBaseUrl()}${TWILIO_WHATSAPP_WEBHOOK_PATH}`;
  const signature = request.headers.get("x-twilio-signature");
  if (!subaccount || !verifyTwilioSignature(webhookUrl, params, signature, subaccount.credentials.authToken)) {
    return new NextResponse(null, { status: 403 });
  }

  const to = params.get("To");
  const waId = params.get("WaId") ?? params.get("From")?.replace(/^whatsapp:\+?/, "");
  const text = params.get("Body");
  const messageId = params.get("MessageSid");
  if (!to || !waId || !text || !messageId) return twimlResponse();

  const { data: connection } = await supabase
    .from("company_whatsapp_connections")
    .select("company_id, agent_id, twilio_sender_id, status, has_payment_issue")
    .eq("company_id", subaccount.companyId)
    .eq("twilio_sender_id", to)
    .eq("provider", "twilio")
    .eq("status", "connected")
    .maybeSingle();
  if (!connection) return twimlResponse();

  await handleInboundWhatsappMessage(supabase, connection, { from: waId, text, messageId }, (reply) =>
    sendTwilioWhatsappMessage(subaccount.credentials, connection.twilio_sender_id, waId, reply),
  );

  return twimlResponse();
}
