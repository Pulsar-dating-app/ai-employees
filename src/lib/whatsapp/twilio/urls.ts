import { resolveCheckoutBaseUrl } from "@/lib/checkout/links";

// The public URLs Twilio calls for a company's WhatsApp senders. One webhook
// per company (not per sender): a company's subaccount holds exactly one WABA
// and one Auth Token, so the URL pins down which token validates the request,
// and the `To` number in the body then picks the sender/agent. Built from
// STAFFRA_CHECKOUT_BASE_URL -- the app's public origin -- so it is also the
// exact string the signature validation is computed over.
export function twilioInboundWebhookUrl(companyId: string): string {
  return `${resolveCheckoutBaseUrl()}/api/webhooks/twilio/whatsapp/${companyId}`;
}

export function twilioStatusCallbackUrl(companyId: string): string {
  return `${twilioInboundWebhookUrl(companyId)}/status`;
}
