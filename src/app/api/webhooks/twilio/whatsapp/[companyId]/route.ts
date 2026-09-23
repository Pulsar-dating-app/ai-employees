import { after } from "next/server";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCompanyTwilioAccount } from "@/lib/whatsapp/twilio/accounts";
import { customerPhoneFromAddress } from "@/lib/whatsapp/twilio/phone";
import { validateTwilioSignature } from "@/lib/whatsapp/twilio/signature";
import { processInboundTwilioMessage, type TwilioConnectionRow } from "@/lib/whatsapp/twilio/inbound";
import { twilioInboundWebhookUrl } from "@/lib/whatsapp/twilio/urls";

// Inbound WhatsApp messages from Twilio, one URL per company
// (/api/webhooks/twilio/whatsapp/<companyId>) because each company has its
// own Twilio subaccount -- and therefore its own Auth Token, which is what
// signs the request. Public, unauthenticated (excluded from src/proxy.ts's
// session-refresh matcher along with the rest of api/webhooks/) -- the
// signature is the only credential, and it is checked before anything in the
// body is trusted.
//
// Twilio gives a webhook ~15s to respond. The Agent Engine can take longer
// than that, so this route acknowledges immediately (an empty TwiML
// response, which makes Twilio send no automatic reply) and runs the actual
// pipeline in `after()` -- it keeps running after the response, up to
// maxDuration below.
export const maxDuration = 60;

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function acknowledge() {
  return new NextResponse(EMPTY_TWIML, { status: 200, headers: { "content-type": "text/xml" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  // Raw form body: the signature covers the exact parameters Twilio sent.
  const formParams = [...new URLSearchParams(await request.text()).entries()];
  const field = (name: string) => formParams.find(([key]) => key === name)?.[1] ?? "";

  const supabase = createServiceClient();

  let account;
  try {
    account = await getCompanyTwilioAccount(supabase, companyId);
  } catch (err) {
    console.error("Twilio WhatsApp webhook: failed to load company credentials", err);
    return new NextResponse(null, { status: 500 });
  }
  // Same status as a bad signature: don't reveal which company ids exist.
  if (!account) return new NextResponse(null, { status: 403 });

  if (
    !validateTwilioSignature(
      twilioInboundWebhookUrl(companyId),
      formParams,
      request.headers.get("x-twilio-signature"),
      account.authToken,
    )
  ) {
    return new NextResponse(null, { status: 403 });
  }

  const messageSid = field("MessageSid");
  const to = field("To"); // whatsapp:+<our sender>
  const from = field("From"); // whatsapp:+<the customer>
  const text = field("Body");
  // Media-only messages (images, voice notes, stickers, location) have no
  // Body: acknowledged and dropped, same as the Meta webhook -- MVP doesn't
  // interpret non-text.
  if (!messageSid || !to || !from || !text) return acknowledge();

  after(async () => {
    try {
      const { data: connection } = await supabase
        .from("company_whatsapp_connections")
        .select("id, company_id, agent_id, phone_e164, status, sender_status")
        .eq("company_id", companyId)
        .eq("provider", "twilio")
        .eq("phone_e164", `+${customerPhoneFromAddress(to)}`)
        .neq("status", "disconnected")
        .maybeSingle();
      if (!connection) return;

      const row = connection as TwilioConnectionRow;
      // A message arriving proves the sender is live even if the status
      // sync hasn't run yet -- promote it instead of dropping the message.
      if (row.status === "pending" || (row.sender_status && row.sender_status.toUpperCase() !== "ONLINE")) {
        await supabase
          .from("company_whatsapp_connections")
          .update({
            status: "connected",
            sender_status: "ONLINE",
            connected_at: new Date().toISOString(),
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        row.status = "connected";
        row.sender_status = "ONLINE";
      }

      await processInboundTwilioMessage(supabase, account, row, {
        customerPhone: customerPhoneFromAddress(from),
        text,
        messageSid,
      });
    } catch (err) {
      console.error("Twilio WhatsApp webhook: pipeline failed", err);
    }
  });

  return acknowledge();
}
