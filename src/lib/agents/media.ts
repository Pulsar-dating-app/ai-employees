// Agent portraits. There's no `agents` image column — every slug gets two
// curated default photos (vendored into `public/agents/`), and a merchant
// can additionally upload a custom one per hire (company_agents.photo_type/
// photo_asset_url, migration 20260905100000). A slug with no defaults falls
// back to the authored `AgentAvatar` silhouette (pass the result straight
// to its `photoSrc`).
const AGENT_DEFAULT_PHOTOS: Record<string, readonly [string, string]> = {
  malu: ["/agents/sales-1.png", "/agents/sales-2.png"],
  ana: ["/agents/secretary-1.png", "/agents/secretary-2.png"],
};

export type AgentPhotoType = "default_1" | "default_2" | "custom";

// The generic catalog view -- a not-yet-hired agent's card on the unified
// My Team page, and the hire page itself -- always shows the first default,
// since there's no per-company selection to read yet for those. An
// already-hired agent's card on My Team instead uses resolveAgentPhoto()
// below, with the merchant's own custom name/photo.
export function agentPhoto(slug: string): string | null {
  return AGENT_DEFAULT_PHOTOS[slug]?.[0] ?? null;
}

// Both curated defaults for a slug, for the picker UI. Null for a slug with
// none configured (shouldn't happen for a real agent, but the picker
// degrades to "custom only" rather than crashing).
export function agentDefaultPhotos(slug: string): readonly [string, string] | null {
  return AGENT_DEFAULT_PHOTOS[slug] ?? null;
}

// The one place that turns a company_agents row's (photo_type, photo_asset_url)
// into an actual src -- every per-company display (my-team list, Connections
// page, scheduling rail, conversations inbox, the public /talk page) goes
// through this instead of agentPhoto() directly.
export function resolveAgentPhoto(
  slug: string,
  photoType: string | null,
  photoAssetUrl: string | null,
): string | null {
  if (photoType === "custom") return photoAssetUrl ?? agentPhoto(slug);
  const defaults = AGENT_DEFAULT_PHOTOS[slug];
  if (!defaults) return null;
  return photoType === "default_2" ? defaults[1] : defaults[0];
}
