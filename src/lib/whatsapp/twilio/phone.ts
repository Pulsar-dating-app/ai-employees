// Phone-number helpers for the Twilio WhatsApp channel.
//
// Two shapes are in play:
//   - E.164 with a leading "+" (`+5511999998888`) -- what the merchant enters,
//     what Twilio's Senders API wants, and what a sender is identified by
//     (company_whatsapp_connections.phone_e164).
//   - digits only (`5511999998888`) -- what `customers.phone` stores for
//     WhatsApp customers (the shape Meta's Cloud API always delivered, and
//     what the (company_id, phone) unique index and the dashboard already
//     assume). Twilio's webhook `From` (`whatsapp:+5511999998888`) is
//     normalised to this so a customer never splits into two rows.

// Returns the E.164 form (`+` and 8-15 digits) or null when the input can't
// be one. Tolerates the punctuation people type: spaces, dashes, dots and
// parentheses. A number with no `+` is rejected rather than guessed at --
// silently assuming a country code would register the wrong sender.
export function normalizeE164(input: string): string | null {
  const trimmed = input.trim().replace(/^whatsapp:/i, "");
  if (!trimmed.startsWith("+")) return null;
  const digits = trimmed.slice(1).replace(/[\s().-]/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `+${digits}`;
}

export function toChannelAddress(e164: string): string {
  return `whatsapp:${e164}`;
}

// `whatsapp:+5511999998888` (or `+5511…`, or bare digits) -> `5511999998888`.
export function customerPhoneFromAddress(address: string): string {
  return address.replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

// Digits-only customer phone -> the address Twilio wants in `To`.
export function addressFromCustomerPhone(phone: string): string {
  return toChannelAddress(`+${phone.replace(/\D/g, "")}`);
}
