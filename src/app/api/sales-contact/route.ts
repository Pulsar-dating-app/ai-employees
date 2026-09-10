import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getClientIp } from "@/lib/web-chat/rate-limit";
import { SALES_LEAD_INTERESTS, SALES_LEAD_REFERRALS } from "@/lib/sales-leads/options";

// Public, unauthenticated surface behind the landing page's "Talk to a
// specialist" modal -- slug-free and outside the merchant-authenticated
// /api/companies/ namespace, same precedent as /api/chat/. Untrusted input
// is validated field by field, then written with the service-role client
// (sales_leads has RLS on with zero policies -- see its migration).
// Excluded from src/proxy.ts's session-refresh middleware: no cookie to
// refresh here.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_RE = /^[0-9()+\-.\s]{5,40}$/;
const IP_WINDOW_MS = 60_000;
const IP_MAX_PER_WINDOW = 5;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = str(body.name, 120);
  const email = str(body.email, 200);
  const whatsapp = str(body.whatsapp, 40);
  const companyName = str(body.companyName, 160);
  const message = str(body.message, 4000);
  const referralSource = body.referralSource == null ? null : oneOf(body.referralSource, SALES_LEAD_REFERRALS);
  const locale = oneOf(body.locale, ["en", "pt"] as const);

  const interests = Array.isArray(body.interests)
    ? Array.from(
        new Set(
          body.interests.filter(
            (i): i is string =>
              typeof i === "string" && (SALES_LEAD_INTERESTS as readonly string[]).includes(i),
          ),
        ),
      )
    : [];

  if (
    !name ||
    !EMAIL_RE.test(email) ||
    !WHATSAPP_RE.test(whatsapp) ||
    interests.length === 0 ||
    !companyName ||
    !message ||
    (body.referralSource != null && body.referralSource !== "" && referralSource === null)
  ) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const ip = getClientIp(request);

  const windowStart = new Date(Date.now() - IP_WINDOW_MS).toISOString();
  const { count, error: countError } = await supabase
    .from("sales_leads")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", windowStart);
  if (countError) {
    console.error("sales-contact: rate-limit count failed", countError.message);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
  if ((count ?? 0) >= IP_MAX_PER_WINDOW) {
    return NextResponse.json({ error: "Too many requests, please try again shortly." }, { status: 429 });
  }

  const { error } = await supabase.from("sales_leads").insert({
    name,
    email,
    whatsapp,
    interests,
    company_name: companyName,
    message,
    referral_source: referralSource,
    locale,
    user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
    ip,
  });
  if (error) {
    console.error("sales-contact: insert failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
