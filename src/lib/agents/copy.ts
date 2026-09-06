import { getTranslations } from "next-intl/server";

// Agent marketing copy (the marketplace / detail / my-team blurb) is UI
// chrome, not data: it's authored per slug in messages/*.json under
// `Agents.descriptions`, localised, and improved without a DB migration.
// The `agents.description` column stays as a fallback for an agent that has
// no authored copy yet — same "DB is the roster, this enriches it" split as
// AGENT_ENRICHMENT and the trait lists. See decisions.md 2026-09-03.
// `name` fills the `{name}` placeholder in the authored copy so the blurb
// reflects the merchant's chosen name for the hire (or the platform default
// on the generic catalog views), not a hardcoded "Malu"/"Ana".
export async function resolveAgentDescription(
  slug: string,
  dbFallback: string | null,
  name: string,
): Promise<string> {
  const t = await getTranslations("Agents");
  const key = `descriptions.${slug}`;
  return t.has(key) ? t(key, { name }) : (dbFallback ?? "");
}
