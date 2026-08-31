// Trello M3 -- pure logic behind the embed domain-allowlist check. Kept out
// of the route so it's unit-testable without a DB/HTTP, same precedent as
// this session's other pure-core extractions (availability/engine.ts,
// analytics/aggregate.ts).
//
// Architecturally necessary, not a shortcut: the chat page's own fetch()
// calls to the API are same-origin to Staffra regardless of iframe nesting, so
// the raw Origin/Referer headers on the API request itself are always
// Staffra's own URL, never the embedding site's -- there is no way to observe
// "what site embedded this" from the API call alone. The only place that
// information exists is client-side, at iframe-load time
// (window.self !== window.top + document.referrer) -- M4/M5 capture that and
// pass it as `embeddedOn` on every request. This is no more spoofable than
// the rest of the layered authorization scheme (a raw curl call can lie
// about anything) -- it stops the casual/accidental misuse case the
// allowlist exists for.

// `www.`-normalized on both sides so a merchant who registers "example.com"
// isn't tripped up by their own site actually serving from "www.example.com"
// (or vice versa) -- a common, easy-to-make mismatch, not a security
// boundary being loosened.
function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

// `embeddedOn` is `null`/absent for a direct (non-embedded) visit to the
// standalone chat page -- always allowed, regardless of the allowlist,
// since there's no third-party site to authorize. A present-but-malformed
// value fails closed (not allowed) rather than being ignored.
//
// An empty string is deliberately NOT treated the same as null/undefined
// (M5): a real embedded visitor whose document.referrer was stripped by the
// host page's own Referrer-Policy still sends `embeddedOn: ""` -- that's
// genuinely-embedded traffic with no readable origin, not a direct visit,
// so it must fail closed like any other unreadable value rather than
// silently bypassing the allowlist.
export function isEmbedOriginAllowed(embeddedOn: string | null | undefined, allowedDomains: readonly string[]): boolean {
  if (embeddedOn === null || embeddedOn === undefined) return true;
  if (embeddedOn === "") return false;

  let hostname: string;
  try {
    hostname = new URL(embeddedOn).hostname;
  } catch {
    return false;
  }
  if (!hostname) return false;

  const normalized = normalizeHostname(hostname);
  return allowedDomains.some((domain) => normalizeHostname(domain) === normalized);
}
