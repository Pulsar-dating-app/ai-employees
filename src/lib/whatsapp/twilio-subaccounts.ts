import type { SupabaseClient } from "@supabase/supabase-js";
import { createSubaccount, type TwilioCredentials } from "@/lib/whatsapp/twilio-api";

function toCredentials(row: { account_sid: string; auth_token: string }): TwilioCredentials {
  return { accountSid: row.account_sid, authToken: row.auth_token };
}

export async function getCompanyTwilioCredentials(
  service: SupabaseClient,
  companyId: string,
): Promise<TwilioCredentials | null> {
  const { data, error } = await service
    .from("company_twilio_accounts")
    .select("account_sid, auth_token")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toCredentials(data) : null;
}

export async function ensureCompanyTwilioCredentials(
  service: SupabaseClient,
  companyId: string,
  friendlyName: string,
): Promise<TwilioCredentials> {
  const existing = await getCompanyTwilioCredentials(service, companyId);
  if (existing) return existing;

  const created = await createSubaccount(friendlyName);
  const { error } = await service
    .from("company_twilio_accounts")
    .insert({ company_id: companyId, account_sid: created.accountSid, auth_token: created.authToken });
  if (!error) return created;
  if (error.code !== "23505") throw new Error(error.message);

  const winner = await getCompanyTwilioCredentials(service, companyId);
  if (!winner) throw new Error("Twilio subaccount row vanished after a concurrent insert");
  return winner;
}

export async function findTwilioSubaccount(
  service: SupabaseClient,
  accountSid: string,
): Promise<{ companyId: string; credentials: TwilioCredentials } | null> {
  const { data, error } = await service
    .from("company_twilio_accounts")
    .select("company_id, account_sid, auth_token")
    .eq("account_sid", accountSid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { companyId: data.company_id, credentials: toCredentials(data) } : null;
}
