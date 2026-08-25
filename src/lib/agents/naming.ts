// Shared with the hire-agent route and the onboarding UI — "agents" has no
// name column of its own (only slug/role/description), so this is the one
// place the capitalize-slug fallback is defined.
export function defaultAgentName(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}
