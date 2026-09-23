import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCompanyTwilioAccount } from "@/lib/whatsapp/twilio/accounts";
import { validateTwilioSignature } from "@/lib/whatsapp/twilio/signature";
import { twilioStatusCallbackUrl } from "@/lib/whatsapp/twilio/urls";

// Delivery-status callbacks for messages we sent (queued -> sent ->
// delivered / read, or failed / undelivered). Signed like the inbound
// webhook, with the same per-company Auth Token. Today this only records
// failures in the server log -- a WhatsApp reply that Twilio accepted but
// Meta then refused (blocked customer, invalid number) is otherwise
// invisible, since the send call itself succeeded.
export async function POST(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const formParams = [...new URLSearchParams(await request.text()).entries()];
  const field = (name: string) => formParams.find(([key]) => key === name)?.[1] ?? "";

  let account;
  try {
    account = await getCompanyTwilioAccount(createServiceClient(), companyId);
  } catch (err) {
    console.error("Twilio WhatsApp status callback: failed to load company credentials", err);
    return new NextResponse(null, { status: 500 });
  }
  if (
    !account ||
    !validateTwilioSignature(
      twilioStatusCallbackUrl(companyId),
      formParams,
      request.headers.get("x-twilio-signature"),
      account.authToken,
    )
  ) {
    return new NextResponse(null, { status: 403 });
  }

  const status = field("MessageStatus");
  if (status === "failed" || status === "undelivered") {
    console.warn("[whatsapp] Twilio reported a delivery failure", {
      companyId,
      messageSid: field("MessageSid"),
      status,
      errorCode: field("ErrorCode") || undefined,
    });
  }

  return new NextResponse(null, { status: 200 });
}
