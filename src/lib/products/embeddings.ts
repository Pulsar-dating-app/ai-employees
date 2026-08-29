import { createOpenAIClient } from "@/lib/openai/client";
import type OpenAI from "openai";

// Hybrid product search's semantic leg. Generates the vectors stored in
// products.embedding (migration 20260829150000_add_product_embeddings) and
// the query-time vector ProductRepository.search compares them against.
//
// 1536-dim, matches the column's declared width -- widening either one
// without the other breaks every insert/compare. Small, not large: this is
// short catalog text (name/category/description), not long-form documents,
// and small is materially cheaper/faster with no meaningful recall loss at
// that length. Pinned exactly (not left to a caller/env default) because a
// query embedded with a different model than the stored ones would compare
// two unrelated vector spaces and silently return nonsense-ranked results --
// there is no in-between "mostly compatible" state.
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

// The exact text embedded for a product -- used identically by every write
// path (create/update/import) so two products embedded by two different
// call sites always live in the same semantic space; a query embeds the
// customer's own words instead (see repository.ts), which is fine, since
// query and document text never need to look alike for the comparison to
// work. Category is included specifically because it's the field that was
// invisible to the lexical search (a merchant's "Vestimentas" vs a
// customer's "roupa" share no lexeme at all) -- this is the whole point of
// adding a semantic leg in the first place.
export function buildProductEmbeddingInput({
  name,
  category,
  description,
}: {
  name: string;
  category?: string | null;
  description?: string | null;
}): string {
  return [name, category, description].filter((part): part is string => Boolean(part && part.trim())).join("\n");
}

// A dedicated kill switch, not a general-purpose flag: global-setup.ts sets
// this for the spawned test next process only, so the ~60 product-create
// call sites across the integration suite never make a real OpenAI network
// call. Every write still succeeds -- this exercises the exact same
// null-embedding path a real API outage would (see the catch blocks below),
// so it's also implicitly testing that failure mode on every single test
// run, not just skipping coverage. Real environments never set this.
function embeddingsDisabledForTests(): boolean {
  return process.env.DISABLE_PRODUCT_EMBEDDINGS === "true";
}

// Never throws -- every caller in the write path (product create/update,
// bulk import) must be able to save the product regardless of what the
// embeddings API does. A null return means "not embedded yet," which the
// hybrid search function already treats as "no semantic signal, fall back
// to lexical" for that row -- degrading recall for one product, never
// blocking a merchant's write or corrupting data. Logged so a real outage
// is still visible in server logs, distinct from "there was nothing to
// embed" or "disabled for tests."
export async function createProductEmbedding(text: string, openaiClient?: OpenAI): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed || embeddingsDisabledForTests()) return null;

  const client = openaiClient ?? createOpenAIClient();

  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      input: trimmed,
    });
    return response.data[0]?.embedding ?? null;
  } catch (err) {
    console.error("createProductEmbedding failed, product will save without one:", err);
    return null;
  }
}

// Batch form for bulk import (Trello B4) -- one API request for the whole
// file's worth of rows instead of one per row, both faster and cheaper.
// Order-preserving and same length as `texts`: a skipped/empty entry (a row
// with no name/description/category -- mapAndValidateRow already rejects
// that before this is ever called, but this function makes no assumption
// about that) gets `null` in its slot rather than shifting every
// subsequent row out of alignment with the products it's about to be
// zipped against.
export async function createProductEmbeddingsBatch(
  texts: string[],
  openaiClient?: OpenAI,
): Promise<(number[] | null)[]> {
  const inputs = texts.map((t) => t.trim());
  if (embeddingsDisabledForTests()) return inputs.map(() => null);

  const nonEmptyIndices = inputs.map((t, i) => (t ? i : -1)).filter((i) => i !== -1);
  if (nonEmptyIndices.length === 0) return inputs.map(() => null);

  const client = openaiClient ?? createOpenAIClient();
  const result: (number[] | null)[] = inputs.map(() => null);

  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      input: nonEmptyIndices.map((i) => inputs[i]),
    });
    // The API returns embeddings in the same order as the input array
    // (OpenAI's documented contract) -- zip back onto the original indices.
    response.data.forEach((item, position) => {
      const originalIndex = nonEmptyIndices[position];
      if (originalIndex !== undefined) result[originalIndex] = item.embedding;
    });
  } catch (err) {
    console.error("createProductEmbeddingsBatch failed, rows will import without embeddings:", err);
    // result stays all-null -- the whole batch degrades together rather
    // than partially, since a partial failure here has no clean way to
    // attribute which specific row caused it.
  }

  return result;
}
