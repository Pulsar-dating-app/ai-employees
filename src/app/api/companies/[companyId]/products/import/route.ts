import { NextResponse, after } from "next/server";
import { parse as parseCsvSync } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validatePriceCurrency, validateStock } from "../route";
import { buildProductEmbeddingInput, createProductEmbeddingsBatch } from "@/lib/products/embeddings";

// Trello ticket B4 — bulk product import (spec §12: upload -> parse ->
// validate -> report invalid rows -> import valid rows). Row numbers in the
// response are 1-indexed positions among the data rows actually parsed
// (blank rows are silently skipped for both formats, same as CSV's own
// skip_empty_lines) — not a literal spreadsheet line number.
//
// Found in production (2026-09-15), two compounding issues with a 1000-row
// import, root-caused from real evidence (not guessed) before each fix:
//
// 1. First 500: the platform's default function timeout killed the request
//    mid-flight (~32s in). Fixed by setting maxDuration here, same as the
//    Shopify sync route -- but this turned out not to be the real
//    constraint (Vercel/Hobby already defaults to 300s under Fluid Compute,
//    confirmed against Vercel's own docs), so this alone didn't fix it.
// 2. Second 500, same symptom: Postgres error 57014, "canceling statement
//    due to statement timeout" -- confirmed from this project's own
//    Postgres logs. PostgREST always executes as the `authenticator` role,
//    even for a service-role request, and `authenticator` carries an 8s
//    `statement_timeout` here. The query PostgREST builds for a bulk
//    `.insert(array)` is one `json_to_recordset($1)` statement over the
//    whole JSON body -- with `embedding` populated (1536 floats/row), a few
//    hundred rows' worth of vectors is enough JSON for that parse + insert
//    to blow past 8s.
//
// Fix, both requirements from the same conversation: (a) insert in chunks
// small enough to clear the 8s ceiling regardless of file size, and (b) the
// import must still be all-or-nothing from the caller's point of view --
// several small statements must never leave a partial catalog behind. Doing
// both while also staying synchronous doesn't fit in one request/response
// cycle (chunked commits take real wall-clock time, and "all or nothing"
// means a late failure has to undo every earlier chunk before the caller
// can be told anything) -- so the actual insert work happens in `after()`,
// AFTER the response (which only reports parse/validation results) is
// already sent.
//
// Follow-up (same day): a request-scoped response can't show live progress,
// and reloading the page loses whatever the client had in memory -- so a
// `product_import_jobs` row (migration 20260915120000) tracks each run
// server-side: `total_rows` at creation, `inserted_count` bumped after every
// chunk commits (the overall, not per-chunk, progress bar this drives), and
// `status` flipped to `succeeded`/`failed` at the end. `GET .../import/status`
// (sibling route) reads the most recent job for the company, so the panel
// can resume showing progress after a reload -- see that route and
// `ImportPanel` for the polling side. On a `failed` job `inserted_count` is
// left as-is for diagnostics but is NOT the real outcome -- the compensating
// rollback above means every one of those rows was deleted; `status` alone
// is the source of truth for "how many actually landed" (all, or none).
export const maxDuration = 300;

// Was 5MB -- found (2026-09-15) to be unsafe on its own terms: Vercel hard-
// caps a Function's request body at 4.5MB, enforced at the infrastructure
// level (no config can raise it), so a 4.5-5MB upload never reached this
// check at all -- it died as a raw platform 413 before our own friendlier
// 400 could ever fire. 3MB is the number the owner picked with that ceiling
// in view: comfortably under 4.5MB, and (checked against a real 1000-row
// test file, ~320 bytes/row for a short description) still generous enough
// for a full MAX_ROWS catalog even with real per-product descriptions
// (Products.import.formatDescriptionHint actively tells merchants to write
// those, not keep them short) -- 2000 rows at that denser size lands
// around 1-1.5MB, well inside this limit.
const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024;
const MAX_ROWS = 2000;
// Small enough that one chunk's json_to_recordset + insert always clears
// the 8s statement_timeout above, however large the file is.
const INSERT_CHUNK_SIZE = 100;

type ParsedRow = Record<string, unknown>;

type MappedProduct = {
  name: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  stock: number | null;
  image_url: string | null;
  product_url: string | null;
  category: string | null;
  sku: string | null;
};

async function requireMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
) {
  const { data: membership, error } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (!membership) {
    return {
      error: NextResponse.json({ error: "Not a member of this company" }, { status: 403 }),
    };
  }

  return { error: null };
}

function cellToString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "object" && value !== null && "text" in (value as Record<string, unknown>)) {
    // exceljs rich-text/hyperlink cell shape: { text, hyperlink } or { richText: [...] }
    const text = (value as { text?: unknown }).text;
    const str = String(text ?? "").trim();
    return str || null;
  }
  const str = String(value).trim();
  return str || null;
}

function parseCsvRows(buffer: Buffer): ParsedRow[] {
  return parseCsvSync(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as ParsedRow[];
}

async function parseXlsxRows(buffer: Buffer): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's bundled types expect an older @types/node Buffer shape than
  // this project's — a real Buffer works fine at runtime regardless.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: ParsedRow[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: ParsedRow = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (!key) return;
      obj[key] = cell.value;
      hasValue = true;
    });
    if (hasValue) rows.push(obj);
  });

  return rows;
}

// Maps spec §12's CSV/XLSX column names onto B3's product fields and
// validates using the same rules the single-product endpoints use (B3's
// exported validatePriceCurrency, plus this ticket's validateStock).
function mapAndValidateRow(row: ParsedRow): { product: MappedProduct } | { reason: string } {
  const name = cellToString(row.name) ?? "";
  if (!name) {
    return { reason: "name is required" };
  }

  const priceRaw = cellToString(row.price);
  let price: number | null = null;
  if (priceRaw !== null) {
    price = Number(priceRaw);
    if (Number.isNaN(price)) {
      return { reason: "price must be a valid number" };
    }
  }

  const currency = cellToString(row.currency);
  const priceError = validatePriceCurrency(price, currency);
  if (priceError) {
    return { reason: priceError };
  }

  const stockRaw = cellToString(row.stock);
  let stock: number | null = null;
  if (stockRaw !== null) {
    const parsed = Number(stockRaw);
    if (!Number.isInteger(parsed)) {
      return { reason: "stock must be a whole number" };
    }
    stock = parsed;
  }
  const stockError = validateStock(stock);
  if (stockError) {
    return { reason: stockError };
  }

  return {
    product: {
      name,
      description: cellToString(row.description),
      price,
      currency,
      stock,
      image_url: cellToString(row.image),
      product_url: cellToString(row.product_url),
      category: cellToString(row.category),
      sku: cellToString(row.sku),
    },
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberCheck = await requireMember(supabase, companyId, user.id);
  if (memberCheck.error) return memberCheck.error;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "A file is required" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 3MB limit" }, { status: 400 });
  }

  const filename = file.name.toLowerCase();
  const isCsv = filename.endsWith(".csv");
  const isXlsx = filename.endsWith(".xlsx") || filename.endsWith(".xls");

  if (!isCsv && !isXlsx) {
    return NextResponse.json(
      { error: "Only .csv, .xlsx, and .xls files are supported" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let rows: ParsedRow[];
  try {
    rows = isCsv ? parseCsvRows(buffer) : await parseXlsxRows(buffer);
  } catch {
    return NextResponse.json(
      { error: "Couldn't parse the file — make sure it's a valid CSV or Excel file" },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "The file has no data rows" }, { status: 400 });
  }

  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `File has ${rows.length} rows, which exceeds the ${MAX_ROWS} limit` },
      { status: 400 },
    );
  }

  const skipped: { row: number; reason: string }[] = [];
  const toInsert: (MappedProduct & { company_id: string })[] = [];

  rows.forEach((row, index) => {
    const result = mapAndValidateRow(row);
    if ("reason" in result) {
      skipped.push({ row: index + 1, reason: result.reason });
    } else {
      toInsert.push({ company_id: companyId, ...result.product });
    }
  });

  let jobId: string | null = null;
  if (toInsert.length > 0) {
    // See this file's top comment for the full story. A service-role
    // client, not the cookie-bound `supabase` request client -- both
    // because it's about to be captured into `after()` (a refreshed-session
    // cookie write mid-call has nowhere to go once the response has already
    // been flushed) and because it writes product_import_jobs, which has no
    // insert/update policy for a regular client at all (service-role only).
    const service = createServiceClient();

    // Created synchronously, before the response, specifically so the
    // client can start polling immediately with a real id -- and so a
    // reload a second later already has a `processing` row to find via
    // GET .../import/status, instead of a window where the import is
    // running but nothing on record admits it yet.
    const { data: job, error: jobError } = await service
      .from("product_import_jobs")
      .insert({ company_id: companyId, total_rows: toInsert.length })
      .select("id")
      .single();
    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 });
    }
    jobId = job.id as string;

    after(async () => {
      // Belt-and-braces around the whole run: whatever goes wrong, the job
      // row must reach a terminal status. Left at `processing` forever, the
      // panel's progress bar would spin indefinitely with nothing left to
      // ever move or resolve it.
      const failJob = async (message: string) => {
        const { error } = await service
          .from("product_import_jobs")
          .update({ status: "failed", error: message })
          .eq("id", jobId as string);
        if (error) {
          console.error(`products import (company ${companyId}): couldn't mark job ${jobId} failed`, error);
        }
      };

      try {
        // One batched embeddings call for the whole file rather than one per
        // row (createProductEmbeddingsBatch) -- see products/embeddings.ts.
        // Order-preserving, so zipping back onto toInsert by index is safe.
        // Not the bottleneck this whole comment is about -- OpenAI's
        // embeddings endpoint handles a 1000-row batch fine, and it isn't
        // subject to Postgres's statement_timeout at all.
        const embeddings = await createProductEmbeddingsBatch(
          toInsert.map((row) => buildProductEmbeddingInput(row)),
        );
        const toInsertWithEmbeddings = toInsert.map((row, i) => ({ ...row, embedding: embeddings[i] }));

        // All-or-nothing: each chunk's own insert stays comfortably under the
        // 8s statement_timeout, but if any chunk fails, every row inserted by
        // an earlier chunk in *this* run is deleted by id before giving up --
        // the company's catalog must never be left with only part of a file
        // imported. `id` is all `.select()` needs to ask for here; nothing
        // else from this insert is ever read.
        const insertedIds: string[] = [];
        for (let i = 0; i < toInsertWithEmbeddings.length; i += INSERT_CHUNK_SIZE) {
          const chunk = toInsertWithEmbeddings.slice(i, i + INSERT_CHUNK_SIZE);
          const { data, error } = await service.from("products").insert(chunk).select("id");
          if (error) {
            console.error(
              `products import (company ${companyId}): chunk at row ${i} failed, rolling back ` +
                `${insertedIds.length} already-inserted row(s)`,
              error,
            );
            if (insertedIds.length > 0) {
              const { error: rollbackError } = await service.from("products").delete().in("id", insertedIds);
              if (rollbackError) {
                // Best-effort by design (see agent-engine's discardConversationItems
                // for the same shape) -- there's no further fallback here, but
                // this must be loud: it means the catalog is left partially
                // imported despite the job being marked failed below.
                console.error(
                  `products import (company ${companyId}): rollback ALSO failed -- ` +
                    `${insertedIds.length} row(s) may remain despite the import failing`,
                  rollbackError,
                );
              }
            }
            await failJob(error.message);
            return;
          }
          insertedIds.push(...(data ?? []).map((row) => row.id as string));
          // Overall progress, not per-chunk -- this is the one write the
          // panel's progress bar polls for while a job is still running.
          await service
            .from("product_import_jobs")
            .update({ inserted_count: insertedIds.length })
            .eq("id", jobId as string);
        }

        console.log(`products import (company ${companyId}): imported ${insertedIds.length} product(s)`);
        const { error: doneError } = await service
          .from("product_import_jobs")
          .update({ status: "succeeded", inserted_count: insertedIds.length })
          .eq("id", jobId as string);
        if (doneError) {
          console.error(`products import (company ${companyId}): couldn't mark job ${jobId} succeeded`, doneError);
        }
      } catch (err) {
        console.error(`products import (company ${companyId}): unexpected failure`, err);
        await failJob(err instanceof Error ? err.message : "Unexpected error");
      }
    });
  }

  // The insert (and any rollback) happens after this response is sent --
  // see the top comment. Only what's known synchronously (parse/validation
  // results) is reported; there is deliberately no imported/products count
  // here, since that outcome doesn't exist yet at response time. `jobId` is
  // what the panel polls GET .../import/status with, and what a reload
  // needs to find (that route also falls back to "most recent job" so a
  // reload works even without this id in hand).
  return NextResponse.json({
    processing: toInsert.length > 0,
    queued: toInsert.length,
    skippedCount: skipped.length,
    skipped,
    jobId,
  });
}
