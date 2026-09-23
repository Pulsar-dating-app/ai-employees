import type { SupabaseClient } from "@supabase/supabase-js";
import { createSubaccount, type TwilioCredentials } from "./api";
import { decryptSecret, encryptSecret } from "./crypto";

// Per-company Twilio subaccount (company_twilio_accounts). Twilio binds one
// WABA to one (sub)account, so every company gets its own -- created lazily
// the first time the company connects a WhatsApp number. Service-role client
// only: the table has no grants for regular clients.
export interface CompanyTwilioAccount extends TwilioCredentials {
  wabaId: string | null;
}

export async function getCompanyTwilioAccount(
  service: SupabaseClient,
  companyId: string,
): Promise<CompanyTwilioAccount | null> {
  const { data, error } = await service
    .from("company_twilio_accounts")
    .select("subaccount_sid, auth_token_encrypted, waba_id")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    accountSid: data.subaccount_sid as string,
    authToken: decryptSecret(data.auth_token_encrypted as string),
    wabaId: (data.waba_id as string | null) ?? null,
  };
}

export async function ensureCompanyTwilioAccount(
  service: SupabaseClient,
  companyId: string,
  friendlyName: string,
): Promise<CompanyTwilioAccount> {
  const existing = await getCompanyTwilioAccount(service, companyId);
  if (existing) return existing;

  const subaccount = await createSubaccount(friendlyName);
  const { error } = await service.from("company_twilio_accounts").insert({
    company_id: companyId,
    subaccount_sid: subaccount.sid,
    auth_token_encrypted: encryptSecret(subaccount.authToken),
  });
  if (error) {
    // 23505: a concurrent connect for the same company won the insert. Use
    // its subaccount; the one just created stays empty and unused (Twilio
    // doesn't bill an idle subaccount).
    if (error.code === "23505") {
      const winner = await getCompanyTwilioAccount(service, companyId);
      if (winner) return winner;
    }
    throw new Error(error.message);
  }
  return { accountSid: subaccount.sid, authToken: subaccount.authToken, wabaId: null };
}

// A subaccount can hold exactly one WABA. Recorded on first successful
// sender registration so a later connect with a *different* WABA is caught
// before it reaches Twilio.
export async function recordCompanyWaba(service: SupabaseClient, companyId: string, wabaId: string) {
  const { error } = await service.from("company_twilio_accounts").update({ waba_id: wabaId }).eq("company_id", companyId);
  if (error) throw new Error(error.message);
}
