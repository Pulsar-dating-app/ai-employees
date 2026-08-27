// Agent portraits. There's no `agents` image column yet — these are the
// Stitch mockup portraits, vendored into `public/agents/`, keyed by
// `agents.slug`. A slug with no entry falls back to the authored
// `AgentAvatar` silhouette (pass the result straight to its `photoSrc`).
const AGENT_PHOTOS: Record<string, string> = {
  malu: "/agents/malu.jpg",
  john: "/agents/john.jpg",
};

export function agentPhoto(slug: string): string | null {
  return AGENT_PHOTOS[slug] ?? null;
}
