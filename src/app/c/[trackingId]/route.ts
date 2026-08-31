import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isLinkPreviewAgent } from "@/lib/checkout/links";
import { resolveLocale } from "@/i18n/request";

// Trello ticket E1 -- the other half of spec §14's checkout loop: C4 mints
// `/c/{tracking-id}`, this resolves it. A real customer taps this in WhatsApp,
// so it must always end in either a redirect or a friendly page -- never a
// stack trace or a raw JSON error.
//
// Public and unauthenticated by design (the customer has no Staffra account and
// isn't in auth.users), so it uses the service-role client: `events` RLS is
// company-membership scoped and would deny both the lookup and the insert.
// The tracking id from the URL is the only untrusted input, and it's used
// solely as a lookup key -- every id written on the click row is copied from
// the minted row we found, never from the request.
//
// A click is a click, never a sale (spec §14/§15, knowledge.md): nothing here
// records revenue, an order, or any completed-purchase signal.

// 302, deliberately not 301: a permanent redirect gets cached by the browser,
// so every click after the first would skip our server entirely and go
// straight to the merchant -- silently losing the very measurement this
// endpoint exists for. no-store on top, so intermediaries don't cache it
// either.
const TEMPORARY_REDIRECT = 302;

type MintedLink = {
  company_id: string;
  agent_id: string | null;
  conversation_id: string;
  customer_id: string;
  product_id: string | null;
  metadata: { destination_url?: string } | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ trackingId: string }> },
) {
  const { trackingId } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("events")
    .select("company_id, agent_id, conversation_id, customer_id, product_id, metadata")
    .eq("tracking_id", trackingId)
    .maybeSingle();

  // A malformed/unknown id and a transient DB error look the same to the
  // customer on purpose -- neither should leak detail about what exists.
  if (error || !data) return invalidLinkResponse();

  const link = data as MintedLink;
  const destinationUrl = link.metadata?.destination_url;
  if (!destinationUrl) return invalidLinkResponse();

  if (!isLinkPreviewAgent(request.headers.get("user-agent"))) {
    await recordClick(supabase, link, trackingId);
  }

  return NextResponse.redirect(destinationUrl, {
    status: TEMPORARY_REDIRECT,
    headers: { "cache-control": "no-store" },
  });
}

// Inserted as its own row rather than mutating the minted one: `events` is
// append-only by explicit decision, and the two rows mean different things --
// the recommendation is "Malu offered this", this is "the customer took it".
// `tracking_id` is left null so the partial unique index (which only covers
// non-null values) never collides across repeat clicks; the id it belongs to
// travels in metadata instead.
async function recordClick(
  supabase: ReturnType<typeof createServiceClient>,
  link: MintedLink,
  trackingId: string,
) {
  const { error } = await supabase.from("events").insert({
    company_id: link.company_id,
    agent_id: link.agent_id,
    conversation_id: link.conversation_id,
    customer_id: link.customer_id,
    product_id: link.product_id,
    type: "checkout_click",
    tracking_id: null,
    metadata: { tracking_id: trackingId },
  });

  // A failed write must never cost the customer their redirect -- they're
  // mid-purchase. Losing one analytics row is strictly better than a dead end.
  if (error) {
    console.error("E1: failed to record checkout_click", { trackingId, error: error.message });
  }
}

async function invalidLinkResponse() {
  const locale = await resolveLocale();
  const t = await getTranslations({ locale, namespace: "CheckoutLink" });

  // Minimal self-contained HTML: this renders for a customer who tapped a
  // dead link in WhatsApp, so it can't depend on the app shell, a session, or
  // client JS. Localized via resolveLocale (same Route-Handler pattern as the
  // product import-template route).
  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(t("title"))}</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#fcfcfd; color:#16181d; padding:24px;
         font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:32rem; text-align:center; }
  h1 { margin:0 0 12px; font-size:1.4rem; line-height:1.25; letter-spacing:-0.02em; }
  p { margin:0; color:#5b6172; line-height:1.6; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(t("title"))}</h1>
  <p>${escapeHtml(t("body"))}</p>
</main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
