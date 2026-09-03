import { getTranslations } from "next-intl/server";

// Agent marketing copy (the marketplace / detail / my-team blurb) is UI
// chrome, not data: it's authored per slug in messages/*.json under
// `Agents.descriptions`, localised, and improved without a DB migration.
// The `agents.description` column stays as a fallback for an agent that has
// no authored copy yet — same "DB is the roster, this enriches it" split as
// AGENT_ENRICHMENT and the trait lists. See decisions.md 2026-09-03.
export async function resolveAgentDescription(
  slug: string,
  dbFallback: string | null,
): Promise<string> {
  const t = await getTranslations("Agents");
  const key = `descriptions.${slug}`;
  return t.has(key) ? t(key) : (dbFallback ?? "");
}
