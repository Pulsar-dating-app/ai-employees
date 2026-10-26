import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cronAuthError } from "@/lib/cron/auth";
import { sendEmail } from "@/lib/email/client";
import { merchantEmailLanguage, renderMerchantNudgeEmail } from "@/lib/email/merchant-nudges";
import { loadPlanAndChannelFacts } from "@/lib/setup/checklist";
import { resolveCheckoutBaseUrl } from "@/lib/checkout/links";
import { defaultAgentName } from "@/lib/agents/naming";
import { dueNudge, NUDGE_AFTER_MS, NUDGE_MAX_AGE_MS, type NudgeKind } from "@/lib/nudges/kinds";

// The merchant nudge e-mails (2026-10-26): one note to the owner of a
// company that signed up and stopped, either mid-onboarding or with their
// hire never put in front of a customer. Who is due what is `dueNudge`
// (lib/nudges/kinds.ts); this route gathers the facts and sends.
//
// Off unless the deploy sets MERCHANT_NUDGES_ENABLED=true, so shipping the
// code or scheduling the job never e-mails anyone by itself. Hourly, via the
// same pg_cron + Vault split as the reminders (migration 20261026134747).
//
// Idempotent across overlapping runs: the `merchant_nudges` row is claimed
// (primary key company + kind) before the send, and released again if the
// send fails so the next run retries.

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  created_at: string;
  onboarding_completed_at: string | null;
};

async function handle(request: Request) {
  const authError = cronAuthError(request);
  if (authError) return authError;
  if (process.env.MERCHANT_NUDGES_ENABLED !== "true") {
    return NextResponse.json({ enabled: false });
  }

  const supabase = createServiceClient();
  const now = Date.now();
  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, name, slug, country, created_at, onboarding_completed_at")
    .lte("created_at", new Date(now - NUDGE_AFTER_MS).toISOString())
    .gte("created_at", new Date(now - NUDGE_MAX_AGE_MS).toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (companies ?? []) as CompanyRow[];
  const ids = rows.map((c) => c.id);
  const { data: sentRows } = ids.length
    ? await supabase.from("merchant_nudges").select("company_id, kind, sent_at").in("company_id", ids)
    : { data: [] };

  const baseUrl = resolveCheckoutBaseUrl();
  let sent = 0;
  let failed = 0;

  for (const company of rows) {
    const [facts, owner, hire] = await Promise.all([
      loadPlanAndChannelFacts(supabase, company.id),
      loadOwner(supabase, company.id),
      loadFirstHire(supabase, company.id),
    ]);
    if (!owner?.email) continue;

    const kind = dueNudge(
      {
        companyCreatedAt: new Date(company.created_at),
        onboardingDone: Boolean(company.onboarding_completed_at),
        channelLive: facts.channelLive,
        sent: ((sentRows ?? []) as { company_id: string; kind: NudgeKind; sent_at: string }[])
          .filter((r) => r.company_id === company.id)
          .map((r) => ({ kind: r.kind, sentAt: new Date(r.sent_at) })),
      },
      new Date(now),
    );
    // "Share her link" needs someone to share.
    if (!kind || (kind === "not_live" && !hire)) continue;

    const { error: claimError } = await supabase.from("merchant_nudges").insert({ company_id: company.id, kind });
    if (claimError) continue; // another run got it first (23505), or the write failed: either way, not this run

    const email = renderMerchantNudgeEmail(
      kind,
      {
        ownerName: owner.name?.trim().split(/\s+/)[0] || null,
        companyName: company.name,
        agentName: hire?.name ?? null,
        scheduling: hire?.slug === "ana",
        chatUrl: hire ? `${baseUrl}/talk/${company.slug}/${hire.slug}` : null,
        ctaUrl: `${baseUrl}/api/nudges/click?k=${kind}`,
      },
      merchantEmailLanguage(company.country),
    );
    const result = await sendEmail({ to: owner.email, ...email });
    if (result.ok) {
      sent++;
    } else {
      failed++;
      await supabase.from("merchant_nudges").delete().eq("company_id", company.id).eq("kind", kind);
    }
  }

  return NextResponse.json({ enabled: true, checked: rows.length, sent, failed });
}

async function loadOwner(supabase: ReturnType<typeof createServiceClient>, companyId: string) {
  const { data: membership } = await supabase
    .from("company_users")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const userId = (membership as { user_id: string } | null)?.user_id;
  if (!userId) return null;
  const { data: user } = await supabase.from("users").select("name, email").eq("id", userId).maybeSingle();
  return user as { name: string | null; email: string | null } | null;
}

async function loadFirstHire(supabase: ReturnType<typeof createServiceClient>, companyId: string) {
  const { data } = await supabase
    .from("company_agents")
    .select("name, agents(slug)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = data as { name: string | null; agents: { slug: string } | null } | null;
  const slug = row?.agents?.slug;
  return slug ? { slug, name: row?.name ?? defaultAgentName(slug) } : null;
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
