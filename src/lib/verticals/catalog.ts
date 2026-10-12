// The trades that get their own public landing page at `/para/<slug>` (plus
// `/en/para/<slug>`, `/it/para/<slug>` — src/i18n/routing.ts). Search demand
// for scheduling tools is per trade ("atendente virtual para barbearia",
// "secretária virtual para clínica odontológica"), and a single homepage
// can't rank for all of them. Every string on these pages is authored copy in
// messages/*.json under `Verticals.<key>`; this file only holds structure.
//
// Client-safe (no next/* imports): routing.ts builds its list of localized
// paths from it.

export const VERTICALS = [
  { slug: "barbearias", key: "barber", video: "barbearia", videoSeconds: 37, videoUploaded: "2026-10-12" },
  { slug: "clinicas-odontologicas", key: "dental", video: "dentista", videoSeconds: 33, videoUploaded: "2026-10-12" },
] as const;

export type Vertical = (typeof VERTICALS)[number];
export type VerticalKey = Vertical["key"];
export type VerticalPath = `/para/${Vertical["slug"]}`;

export function verticalPath(vertical: Vertical): VerticalPath {
  return `/para/${vertical.slug}`;
}

export function findVertical(slug: string): Vertical | null {
  return VERTICALS.find((v) => v.slug === slug) ?? null;
}

/** Demo video and its poster frame, served from `public/verticals/`. */
export function verticalVideo(vertical: Vertical) {
  return {
    src: `/verticals/${vertical.video}.mp4`,
    poster: `/verticals/${vertical.video}-poster.webp`,
    /** ISO 8601 duration, for VideoObject structured data. */
    duration: `PT${vertical.videoSeconds}S`,
  };
}
