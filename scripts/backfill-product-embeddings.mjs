// One-off backfill for hybrid product search (Trello: pgvector, see
// supabase/migrations/20260829150000_add_product_embeddings.sql). Every
// product created or edited *after* that migration lands gets its embedding
// generated at write time (src/lib/products/embeddings.ts, wired into the
// product routes) -- this script exists only to fill in the ones that
// already existed before that code shipped, or any row whose embedding
// generation failed at write time (a real API hiccup, degraded gracefully
// to null rather than blocking the write -- see that module's own comments).
//
// Plain .mjs, not a TypeScript module importing the app's path-aliased code:
// this repo has no ts-node/tsx runner, so the (small) amount of duplicated
// logic here is the pragmatic tradeoff over adding a new dev dependency for
// a one-off script. If this logic needs to change, change it in BOTH
// src/lib/products/embeddings.ts (the real, tested write path) and here.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... \
//     node scripts/backfill-product-embeddings.mjs [--company-id=<uuid>]
//
// Safe to re-run: only ever selects rows where embedding is null, so a
// partial/interrupted run just picks up where it left off next time.

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100; // stays well under the API's per-request token cap for short catalog text

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !serviceRoleKey || !openaiApiKey) {
  console.error(
    "Missing required env vars. Need SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), " +
      "SUPABASE_SERVICE_ROLE_KEY, and OPENAI_API_KEY.",
  );
  process.exit(1);
}

const companyIdArg = process.argv.find((arg) => arg.startsWith("--company-id="));
const companyId = companyIdArg ? companyIdArg.split("=")[1] : null;

const supabase = createClient(supabaseUrl, serviceRoleKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

// Must exactly match buildProductEmbeddingInput in src/lib/products/embeddings.ts.
function buildEmbeddingInput({ name, category, description }) {
  return [name, category, description].filter((part) => part && part.trim()).join("\n");
}

async function fetchBatch() {
  let query = supabase
    .from("products")
    .select("id, name, category, description")
    .eq("is_active", true)
    .is("embedding", null)
    .limit(BATCH_SIZE);
  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function main() {
  let totalEmbedded = 0;
  let totalSkipped = 0;

  for (;;) {
    const rows = await fetchBatch();
    if (rows.length === 0) break;

    const inputs = rows.map((row) => buildEmbeddingInput(row));
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      input: inputs,
    });

    const updates = rows.map((row, i) => ({ id: row.id, embedding: response.data[i]?.embedding ?? null }));

    for (const update of updates) {
      if (!update.embedding) {
        totalSkipped += 1;
        continue;
      }
      const { error } = await supabase.from("products").update({ embedding: update.embedding }).eq("id", update.id);
      if (error) throw error;
      totalEmbedded += 1;
    }

    console.log(`Embedded ${totalEmbedded} so far (${totalSkipped} skipped)...`);
  }

  console.log(`Done. Embedded ${totalEmbedded} products, skipped ${totalSkipped}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
