// Long-form guides at `/guias/<slug>` (plus `/en/guias/…`, `/it/guias/…`).
// They answer the broad questions buyers — and the AI assistants they ask —
// start from ("how does automatic WhatsApp booking work?"), which a product
// page can't rank or be cited for. Copy lives in messages/*.json under
// `Guides.<key>`; this file only holds structure.
//
// Client-safe (no next/* imports): routing.ts builds its list of localized
// paths from it.

export const GUIDES = [
  {
    slug: "agendamento-automatico-whatsapp",
    key: "whatsappScheduling",
    published: "2026-10-12",
    updated: "2026-10-12",
  },
] as const;

export type Guide = (typeof GUIDES)[number];
export type GuidePath = `/guias/${Guide["slug"]}`;

export function guidePath(guide: Guide): GuidePath {
  return `/guias/${guide.slug}`;
}

export function findGuide(slug: string): Guide | null {
  return GUIDES.find((g) => g.slug === slug) ?? null;
}
