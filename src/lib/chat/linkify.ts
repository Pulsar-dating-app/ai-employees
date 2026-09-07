// Splits a plain-text chat message into text / URL runs so the UI can
// render the URLs as real anchors. Agent replies routinely contain a
// checkout link (`{base}/c/{tracking-id}`) that was arriving as dead text
// in both the customer widget and the dashboard thread.

export type TextSegment = { type: "text"; value: string };
export type LinkSegment = { type: "link"; value: string; href: string };
export type MessageSegment = TextSegment | LinkSegment;

// Only http(s) — never `javascript:` / `data:` etc., so the href is always
// safe to drop straight into an <a>. A URL runs until whitespace; trailing
// punctuation that is almost never part of the URL (a sentence's period, a
// closing bracket/quote) is peeled back onto the following text run.
const URL_RE = /https?:\/\/[^\s]+/g;
const TRAILING_PUNCT_RE = /[.,;:!?)\]}>"'»]+$/;

export function splitOnUrls(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let url = match[0];
    let trailing = "";

    const trailMatch = url.match(TRAILING_PUNCT_RE);
    if (trailMatch) {
      trailing = trailMatch[0];
      url = url.slice(0, -trailing.length);
    }
    // A URL that was *only* punctuation after the scheme isn't a link.
    if (!url || /^https?:\/\/$/.test(url)) continue;

    if (start > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, start) });
    }
    segments.push({ type: "link", value: url, href: url });
    if (trailing) segments.push({ type: "text", value: trailing });

    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}
