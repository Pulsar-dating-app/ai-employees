import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolCallRecord } from "./tool-loop";

// Trello ticket C7 -- the enforcement layer behind spec §6/§18's "must never
// invent price/stock/policy/characteristics", i.e. what turns grounding from
// a hope into a guarantee. This is step 10 of the C1 pipeline, which shipped
// as a pass-through stub specifically waiting for this ticket.
//
// The card offered two MVP approaches and asked for one to be picked and
// documented. This is approach (b): keep a structured record of the facts a
// turn actually retrieved, then check the final response against it. (a)
// ("constrain the model to quote/template tool results directly") was
// rejected because it is itself just another instruction -- the same class of
// thing as prompt.ts's GROUNDING_GUARDRAIL, which hand-testing already broke
// twice during C3 -- and because reciting fields would wreck spec §7's
// humanized conversation.
//
// SCOPE, stated honestly: only a fact with a canonical value in Postgres can
// be checked deterministically. That means numeric price and stock claims,
// and nothing else. A non-numeric policy or characteristic claim ("we accept
// returns", "it's cotton") is a semantic judgement no pattern check can make
// without a second model in the loop, so those stay covered by the
// prompt-level guardrail only. See decisions.md -- this ticket deliberately
// ships the enforceable subset with a real guarantee rather than a
// looks-complete check that quietly guesses.
//
// Precision matters more than recall here: a false block replaces a perfectly
// good reply with "let me check that", degrading every conversation, while a
// miss lands back on the prompt-level guardrail that already exists. Hence
// the narrow claim patterns below, hence ambiguous number formats counting
// every plausible reading, and hence the three grounding sources (this turn's
// tool results, the customer's own words, and the company's real current
// data) rather than tool results alone.

export type GroundingClaimKind = "price" | "stock";

export type GroundingClaim = {
  kind: GroundingClaimKind;
  // The literal snippet that matched, echoed back into the correction
  // instruction so the model is told exactly which figure was rejected.
  text: string;
  // Every plausible numeric reading of the figure (see parseNumericToken).
  values: number[];
};

export type GroundingCheckResult = {
  grounded: boolean;
  violations: GroundingClaim[];
};

// Money and quantities are compared as integer cents/units so 129.90, "129,9"
// and the numeric 129.9 all collapse to one key -- float equality would fail
// on exactly the values this check exists for.
function toKey(value: number): number {
  return Math.round(value * 100);
}

// Any run of digits possibly carrying grouping/decimal separators.
const NUMBER_TOKEN = /\d[\d.,]*/g;

// Locale-agnostic on purpose: this app already serves pt-BR ("1.299,90") and
// en ("1,299.90") customers in the same conversation stream. The last
// separator is the decimal point *unless* it's followed by exactly three
// digits, which is genuinely ambiguous across those two locales ("1.500" is
// 1500 in pt-BR and 1.5 in en) -- ambiguity yields both readings, since a
// wrongly-widened grounded set costs far less than a wrongly-blocked reply.
export function parseNumericToken(token: string): number[] {
  const cleaned = token.replace(/^[.,]+/, "").replace(/[.,]+$/, "");
  if (!/^\d[\d.,]*$/.test(cleaned)) return [];

  const readings = new Set<number>();
  const lastSeparator = Math.max(cleaned.lastIndexOf("."), cleaned.lastIndexOf(","));

  if (lastSeparator === -1) {
    const plain = Number(cleaned);
    if (Number.isFinite(plain)) readings.add(plain);
    return [...readings];
  }

  const integerPart = cleaned.slice(0, lastSeparator).replace(/[.,]/g, "");
  const fractionPart = cleaned.slice(lastSeparator + 1);

  if (/^\d+$/.test(integerPart) && /^\d+$/.test(fractionPart)) {
    const asDecimal = Number(`${integerPart}.${fractionPart}`);
    if (Number.isFinite(asDecimal)) readings.add(asDecimal);

    // Only a 3-digit tail can plausibly be a thousands group.
    if (fractionPart.length === 3) {
      const asGrouped = Number(cleaned.replace(/[.,]/g, ""));
      if (Number.isFinite(asGrouped)) readings.add(asGrouped);
    }
  }

  return [...readings];
}

function collectNumbersFromText(text: string, into: Set<number>): void {
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    for (const value of parseNumericToken(match[0])) into.add(toKey(value));
  }
}

// Walks a tool result (arbitrary JSON) for every number it contains, in any
// shape. Deliberately indiscriminate: `products.price` arrives as a *string*
// from PostgREST, policy/FAQ content is free text carrying real figures
// ("frete grátis acima de R$ 200"), and `products.metadata` is open jsonb --
// enumerating known fields would silently miss whichever one a future tool
// adds.
export function collectNumbers(value: unknown, into: Set<number>): void {
  if (typeof value === "number") {
    if (Number.isFinite(value)) into.add(toKey(value));
    return;
  }
  if (typeof value === "string") {
    collectNumbersFromText(value, into);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectNumbers(entry, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectNumbers(entry, into);
  }
}

const CURRENCY_WORDS = "reais|real|d[óo]lares|d[óo]lar|euros|euro|libras|libra|BRL|USD|EUR|GBP";

// Only figures carrying an explicit money marker (a symbol, a currency word,
// or a price verb) count as a price claim. A bare number is left alone --
// sizes, counts, dates and product names are full of them, and Malu
// essentially always writes the currency when quoting a price.
const PRICE_PATTERNS: RegExp[] = [
  /(?:R\$|US\$|\$|€|£)\s*(\d[\d.,]*)/gi,
  new RegExp(String.raw`(\d[\d.,]*)\s*(?:${CURRENCY_WORDS})\b`, "gi"),
  /(?:custam?|saem? por|pre[çc]o(?:\s+(?:de|é|e))?|valor(?:\s+de)?|por apenas|costs?|price(?:\s+(?:is|of))?|priced at)\s*:?\s*(\d[\d.,]*)/gi,
  // Installments -- "3x de 29,97". Found while hand-testing: this is the
  // easiest way to make the model produce an unretrieved figure (nothing in
  // the schema stores instalment plans, so every one of them is arithmetic),
  // and the instalment amount is routinely written without a currency marker,
  // so none of the patterns above caught it. The mandatory "de" is what keeps
  // this off dimensions like "30x40 cm".
  /\b\d+\s*x\s+de\s+(?:R\$\s*)?(\d[\d.,]*)/gi,
];

// Same idea for quantities: the number has to sit next to an actual stock
// word. "temos 3 modelos" or "encontrei 2 opções" are counts of what the
// search returned, not stock claims, and must not be blocked.
const STOCK_PATTERNS: RegExp[] = [
  /(\d[\d.,]*)\s*(?:unidades?|pe[çc]as?|pares?|units?|pcs?)\b/gi,
  /(\d[\d.,]*)\s+(?:em|no)\s+estoque\b/gi,
  /(\d[\d.,]*)\s+(?:in stock|left|dispon[íi]ve(?:l|is))\b/gi,
  /(?:estoque|stock)\s*:?\s*(\d[\d.,]*)\b/gi,
];

// Checkout links (C4) and product_url values carry digits in their ids/paths;
// none of that is a claim about anything.
const URL_PATTERN = /https?:\/\/\S+/gi;

function nextCharAfterGroup(source: string, match: RegExpMatchArray): string {
  const matchStart = match.index ?? 0;
  const groupOffset = match[0].lastIndexOf(match[1]);
  return source.charAt(matchStart + groupOffset + match[1].length);
}

function matchClaims(source: string, patterns: RegExp[], kind: GroundingClaimKind, into: GroundingClaim[]): void {
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      // "10% de desconto" is a percentage, not a currency amount -- and no
      // discount is stored anywhere in the schema for it to be checked
      // against, so matching it would block every reply that mentions one.
      if (nextCharAfterGroup(source, match) === "%") continue;

      const values = parseNumericToken(match[1]);
      if (values.length === 0) continue;

      const key = `${kind}|${values.map(toKey).sort().join(",")}`;
      if (into.some((claim) => `${claim.kind}|${claim.values.map(toKey).sort().join(",")}` === key)) continue;

      into.push({ kind, text: match[0].trim(), values });
    }
  }
}

export function extractGroundingClaims(responseText: string): GroundingClaim[] {
  const source = responseText.replace(URL_PATTERN, " ");
  const claims: GroundingClaim[] = [];
  matchClaims(source, PRICE_PATTERNS, "price", claims);
  matchClaims(source, STOCK_PATTERNS, "stock", claims);
  return claims;
}

function isGrounded(claim: GroundingClaim, grounded: Set<number>): boolean {
  return claim.values.some((value) => grounded.has(toKey(value)));
}

// Bounded because this is a membership test, not a listing -- one matching
// row is all it takes to ground a figure.
const CATALOG_LOOKUP_LIMIT = 20;

// The cross-turn backstop, and the reason this check is usable at all. A
// price retrieved three turns ago and simply restated now would otherwise be
// blocked, because OpenAI holds prior turns server-side and this process has
// no record of what those turns retrieved. Rather than caching a per-
// conversation fact ledger (which would go stale and start *approving* prices
// the merchant has since changed), a leftover figure is checked against the
// company's real current data. Staleness therefore fails, correctly.
//
// Accepted limitation: this grounds a figure against the company's data as a
// whole, not against the specific product the sentence is about, so quoting
// product A's real price while talking about product B still passes. That
// mis-attribution isn't deterministically detectable without knowing which
// product a sentence refers to, and it's a far smaller harm than inventing a
// number outright -- which is what this catches.
async function collectCompanyFactNumbers(
  supabase: SupabaseClient,
  companyId: string,
  claims: GroundingClaim[],
): Promise<Set<number>> {
  const priceCandidates = [
    ...new Set(claims.filter((c) => c.kind === "price").flatMap((c) => c.values)),
  ].filter((value) => Number.isFinite(value) && value >= 0);

  // `products.stock` is an integer column -- a fractional candidate can never
  // match it and would only make PostgREST work harder.
  const stockCandidates = [
    ...new Set(claims.filter((c) => c.kind === "stock").flatMap((c) => c.values)),
  ].filter((value) => Number.isInteger(value) && value >= 0);

  const [priceRows, stockRows, company] = await Promise.all([
    priceCandidates.length > 0
      ? supabase
          .from("products")
          .select("price")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .in("price", priceCandidates)
          .limit(CATALOG_LOOKUP_LIMIT)
      : null,
    stockCandidates.length > 0
      ? supabase
          .from("products")
          .select("stock")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .in("stock", stockCandidates)
          .limit(CATALOG_LOOKUP_LIMIT)
      : null,
    // Free-text business data carries real figures the model may legitimately
    // restate ("frete grátis acima de R$ 200", "troca em até 30 dias").
    supabase
      .from("companies")
      .select("description, shipping_policy, return_policy, payment_policy, faq")
      .eq("id", companyId)
      .maybeSingle(),
  ]);

  // Thrown, not swallowed: every tool in this turn reads the same Postgres, so
  // a failure here means the turn was already broken -- silently treating it
  // as "nothing is grounded" would blanket-block real answers instead.
  if (priceRows?.error) throw priceRows.error;
  if (stockRows?.error) throw stockRows.error;
  if (company.error) throw company.error;

  const numbers = new Set<number>();
  collectNumbers(priceRows?.data ?? null, numbers);
  collectNumbers(stockRows?.data ?? null, numbers);
  collectNumbers(company.data ?? null, numbers);
  return numbers;
}

// Step 10. Returns the claims that survived every grounding source -- an
// empty list means the response is safe to send.
export async function checkResponseGrounding({
  responseText,
  toolResults,
  customerMessage,
  supabase,
  companyId,
}: {
  responseText: string;
  toolResults: ToolCallRecord[];
  customerMessage: string;
  supabase: SupabaseClient;
  companyId: string;
}): Promise<GroundingCheckResult> {
  const claims = extractGroundingClaims(responseText);
  // The overwhelmingly common case: a reply that quotes no figure at all
  // costs nothing to validate, not even a query.
  if (claims.length === 0) return { grounded: true, violations: [] };

  const grounded = new Set<number>();
  collectNumbers(
    toolResults.map((record) => record.result),
    grounded,
  );
  // The customer's own words count as a source: echoing back a budget they
  // just stated ("tenho até 200") invents nothing.
  collectNumbersFromText(customerMessage, grounded);

  const unmatched = claims.filter((claim) => !isGrounded(claim, grounded));
  if (unmatched.length === 0) return { grounded: true, violations: [] };

  const companyNumbers = await collectCompanyFactNumbers(supabase, companyId, unmatched);
  const violations = unmatched.filter((claim) => !isGrounded(claim, companyNumbers));

  return { grounded: violations.length === 0, violations };
}

// Sent as the retry turn's input when a draft fails the check. A `developer`
// role (not `user`) because this is an internal correction and must never
// read as something the customer said -- it does end up stored in the OpenAI
// conversation, but it asserts no fact and is never customer-visible.
//
// Regenerating rather than jumping straight to canned text is the point: with
// the tools still available, the usual outcome is that Malu goes and actually
// looks the figure up, and the customer gets a real answer in her own voice
// and language. The canned fallback only exists for the rare second failure.
export function buildGroundingCorrectionInput(violations: GroundingClaim[]) {
  const figures = violations.map((violation) => `"${violation.text}"`).join(", ");

  return [
    {
      role: "developer" as const,
      content:
        "CORRECTION -- your previous draft reply was rejected and was NOT sent to the customer. " +
        `It stated ${figures}, which does not appear in anything you actually retrieved. ` +
        "Never state a price or a stock quantity you have not looked up with a tool, and never " +
        "state a total, sum, or discount you worked out yourself -- give each item's real " +
        "retrieved price instead. Answer the customer's last message again now: either look the " +
        "figure up with your tools first, or, if you genuinely can't, tell them honestly that " +
        "you'll confirm it and offer to help with something else meanwhile. Never mention this " +
        "correction, a draft, tools, or anything else technical -- just reply naturally in your " +
        "own voice, in the customer's language.",
    },
  ];
}
