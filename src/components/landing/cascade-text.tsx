// Per-character hover reveal for button labels: each glyph slides up to
// make way for a duplicate of itself (a `text-shadow` copy placed exactly
// one reveal-height below, so no second DOM node's color needs tracking),
// staggered a few ms per character. Adapted from a user-linked "cascade
// text" reference component — reworked from a standalone hover-tracking
// root element into plain content meant to sit *inside* an existing
// button shell:
//   - Driven by an ancestor `.group`'s `:hover` (see the matching CSS in
//     globals.css), not local mouseenter/mouseleave state, so hovering
//     anywhere on the button — its icon, its padding — triggers the text,
//     not just the exact glyph pixels. The reference tracked hover on
//     itself because it *was* the whole clickable link.
//   - Both the resting and incoming glyph render in `currentColor`, no
//     hardcoded accent — every button on this page already defines its
//     own hover text color, and this must ride along with that, not
//     compete with it.
//   - No forced `uppercase`/tracking — this page's button labels are
//     already mixed-case by design.
//   - No client JS at all: the reveal is pure CSS (`.group:hover` +
//     transitions, `prefers-reduced-motion` handled in CSS too), so this
//     stays a plain server-renderable function, not `"use client"`.
//   - One shared clip+center container for the whole word (matching the
//     reference's own structure), not one per character: an earlier,
//     per-character-clipped version fought the button's inherited
//     line-height and clipped/mis-centered accented Portuguese glyphs
//     (ã, ç, é) — a single flex row centers the whole run of characters
//     together against one reserved height instead.
//
// Accessibility: splitting text into one element per character makes some
// screen readers spell it out letter by letter, so this markup is
// `aria-hidden` — the real accessible name must come from an `aria-label`
// on the enclosing button/link (the reference didn't need this because it
// *was* the root link and used `aria-label` there itself). Every call site
// in landing-page-2.tsx must set that label.
export function CascadeText({ text, className = "" }: { text: string; className?: string }) {
  const chars =
    typeof Intl !== "undefined" && Intl.Segmenter
      ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment)
      : [...text];

  return (
    <span aria-hidden="true" className={`lv2-cascade inline-flex items-center overflow-hidden align-top ${className}`}>
      {chars.map((char, i) => (
        <span key={i} className="lv2-cascade-glyph" style={{ transitionDelay: `${i * 22}ms` }}>
          {char === " " ? " " : char}
        </span>
      ))}
    </span>
  );
}
