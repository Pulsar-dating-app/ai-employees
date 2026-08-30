import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Trello ticket B2 — single-resource sibling of the collection endpoints in
// ../route.ts. Field names/shapes here are what C3's get_business_information
// / get_policy_information tools will read at runtime, so keep them stable.

const MAX_TEXT_LENGTH = 5000; // description, shipping/return/payment policy, additional_information
const MAX_SHORT_LENGTH = 255; // name, email, phone, website_url, country, timezone, industry
const MAX_FAQ_ENTRIES = 50;
const MAX_FAQ_QUESTION_LENGTH = 300;
const MAX_FAQ_ANSWER_LENGTH = 2000;

// Trello M7 -- the widget's domain allowlist (M1). A bare-hostname pattern
// (letters/digits/hyphens, at least one dot) since that's the exact shape
// isEmbedOriginAllowed (src/lib/web-chat/embed-authorization.ts) compares
// against -- storing "https://example.com/" instead of "example.com" would
// silently never match anything.
const MAX_EMBED_DOMAINS = 20;
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// Forgiving of the most common paste mistake (a full URL instead of a bare
// hostname) rather than rejecting it outright -- a merchant filling this in
// is very likely to paste "https://example.com/" verbatim. Strips a
// leading scheme and everything from the first "/" or ":" onward, then
// lowercases (matching normalizeHostname's own case-insensitivity).
function normalizeEmbedDomainInput(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .split(/[/:]/)[0]
    .toLowerCase();
}

const TEXT_FIELDS = [
  "description",
  "shipping_policy",
  "return_policy",
  "payment_policy",
  "additional_information",
] as const;

const SHORT_FIELDS = [
  "name",
  "email",
  "phone",
  "website_url",
  "country",
  "timezone",
  "industry",
] as const;

async function requireMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
) {
  const { data: membership, error } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }), role: null };
  }

  if (!membership) {
    return {
      error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }),
      role: null,
    };
  }

  return { error: null, role: membership.role as string };
}

async function requireAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
) {
  const membership = await requireMember(supabase, companyId, userId);
  if (membership.error) return membership;

  if (!["owner", "admin"].includes(membership.role!)) {
    return {
      error: NextResponse.json(
        { error: "Only company owners/admins can update this company" },
        { status: 403 },
      ),
      role: membership.role,
    };
  }

  return membership;
}

function isFaqValid(faq: unknown): faq is { question: string; answer: string }[] {
  if (!Array.isArray(faq)) return false;
  if (faq.length > MAX_FAQ_ENTRIES) return false;

  return faq.every(
    (entry) =>
      entry !== null &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).question === "string" &&
      typeof (entry as Record<string, unknown>).answer === "string" &&
      (entry as { question: string }).question.length > 0 &&
      (entry as { question: string }).question.length <= MAX_FAQ_QUESTION_LENGTH &&
      (entry as { answer: string }).answer.length > 0 &&
      (entry as { answer: string }).answer.length <= MAX_FAQ_ANSWER_LENGTH,
  );
}

// GET: any company member can view the full company row (profile + knowledge
// fields) — matches RLS's is_company_member.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const { data, error } = await supabase.from("companies").select("*").eq("id", companyId).single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ company: data });
}

// PATCH: only owner/admin can update — matches RLS's is_company_admin.
// Merge-patch semantics: a key present with value null clears that column;
// an omitted key leaves it untouched. faq is whole-array-replace, per the
// ticket's "simplest MVP behavior."
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const adminCheck = await requireAdmin(supabase, companyId, user.id);
  if (adminCheck.error) return adminCheck.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  for (const field of TEXT_FIELDS) {
    if (!(field in body)) continue;
    const value = (body as Record<string, unknown>)[field];
    if (value !== null && (typeof value !== "string" || value.length > MAX_TEXT_LENGTH)) {
      return NextResponse.json(
        { error: `${field} must be a string up to ${MAX_TEXT_LENGTH} characters, or null` },
        { status: 400 },
      );
    }
    updates[field] = value;
  }

  for (const field of SHORT_FIELDS) {
    if (!(field in body)) continue;
    const value = (body as Record<string, unknown>)[field];
    if (value !== null && (typeof value !== "string" || value.length > MAX_SHORT_LENGTH)) {
      return NextResponse.json(
        { error: `${field} must be a string up to ${MAX_SHORT_LENGTH} characters, or null` },
        { status: 400 },
      );
    }
    updates[field] = value;
  }

  if ("currency" in body) {
    const value = (body as Record<string, unknown>).currency;
    if (value !== null && (typeof value !== "string" || value.length !== 3)) {
      return NextResponse.json(
        { error: "currency must be a 3-character string, or null" },
        { status: 400 },
      );
    }
    updates.currency = value;
  }

  if ("faq" in body) {
    const value = (body as Record<string, unknown>).faq;
    if (value !== null && !isFaqValid(value)) {
      return NextResponse.json(
        {
          error: `faq must be null or an array of up to ${MAX_FAQ_ENTRIES} {question, answer} objects (question <= ${MAX_FAQ_QUESTION_LENGTH} chars, answer <= ${MAX_FAQ_ANSWER_LENGTH} chars)`,
        },
        { status: 400 },
      );
    }
    updates.faq = value;
  }

  // Trello M7 — the widget's domain allowlist. Not nullable like the
  // text/short fields (the column is `not null default '{}'`) -- an empty
  // array *is* the valid "no domains configured yet, block everywhere"
  // state (M1's deny-by-default decision), so unlike faq there's no `null`
  // clear-value here. Whole-array-replace on save, same as faq.
  if ("allowed_embed_domains" in body) {
    const value = (body as Record<string, unknown>).allowed_embed_domains;
    if (!Array.isArray(value)) {
      return NextResponse.json(
        { error: "allowed_embed_domains must be an array of domains (an empty array is valid)" },
        { status: 400 },
      );
    }
    if (value.length > MAX_EMBED_DOMAINS) {
      return NextResponse.json(
        { error: `allowed_embed_domains can have at most ${MAX_EMBED_DOMAINS} entries` },
        { status: 400 },
      );
    }
    const normalized: string[] = [];
    for (const entry of value) {
      if (typeof entry !== "string") {
        return NextResponse.json({ error: "Each domain must be a string" }, { status: 400 });
      }
      const domain = normalizeEmbedDomainInput(entry);
      if (!domain || domain.length > MAX_SHORT_LENGTH || !HOSTNAME_PATTERN.test(domain)) {
        return NextResponse.json(
          { error: `"${entry}" doesn't look like a valid domain (e.g. "example.com")` },
          { status: 400 },
        );
      }
      normalized.push(domain);
    }
    updates.allowed_embed_domains = normalized;
  }

  // Trello H3 — whether Ana's book_appointment tool (and this app's own
  // appointments POST route) auto-confirms a new booking or holds it as
  // 'requested' pending merchant approval. Not nullable like the
  // text/short fields above — a boolean setting has no "unset" state.
  if ("requires_appointment_approval" in body) {
    const value = (body as Record<string, unknown>).requires_appointment_approval;
    if (typeof value !== "boolean") {
      return NextResponse.json(
        { error: "requires_appointment_approval must be a boolean" },
        { status: 400 },
      );
    }
    updates.requires_appointment_approval = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("companies")
    .update(updates)
    .eq("id", companyId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ company: data });
}
