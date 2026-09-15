import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { api } from "./helpers/request";
import { getTestEnv } from "./helpers/env";
import { signUpTestUser } from "./helpers/auth";

// Trello ticket B4 — bulk product import via CSV/XLSX upload. Uses raw
// fetch + FormData directly (not the shared `api()` helper, which always
// JSON-stringifies the body) since this endpoint expects multipart/form-data.
//
// The actual insert runs in `after()`, after the response the tests below
// assert on is already sent (see the route's own top comment for the full
// "why") — so a request's immediate JSON only ever reports what's known
// synchronously (parse/validation results, as `queued`/`skippedCount`/
// `skipped`), never a final imported count or the inserted rows. Tests that
// need to assert the products actually landed poll the list endpoint via
// waitForProducts below instead of reading them off the import response.

interface ImportResult {
  queued: number;
  skippedCount: number;
  skipped: { row: number; reason: string }[];
}

interface ProductRow {
  id: string;
  name: string;
  stock: number | null;
}

// Polls GET /products until at least `count` rows exist for the company, or
// throws after the timeout. Embeddings are disabled in tests
// (DISABLE_PRODUCT_EMBEDDINGS, see embeddings.ts) so the background insert
// this waits on is fast; the timeout is generous only to absorb normal
// scheduling/DB round-trip jitter, same shape as waitForEmail.
async function waitForProducts(
  ownerCookie: string,
  companyId: string,
  count: number,
  timeoutMs = 5000,
): Promise<ProductRow[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await api<{ products: ProductRow[]; total: number }>(
      "GET",
      `/api/companies/${companyId}/products?pageSize=100`,
      ownerCookie,
    );
    if (res.json.total >= count) return res.json.products;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`fewer than ${count} product(s) landed for company ${companyId} within ${timeoutMs}ms`);
}

async function createCompany(ownerCookie: string, name: string) {
  const created = await api<{ company: { id: string } }>("POST", "/api/companies", ownerCookie, { name });
  return created.json.company.id;
}

async function importFile(
  cookie: string | undefined,
  companyId: string,
  file: File,
): Promise<{ status: number; json: ImportResult & { error?: string } }> {
  const { baseUrl } = getTestEnv();
  const formData = new FormData();
  formData.set("file", file);

  const res = await fetch(`${baseUrl}/api/companies/${companyId}/products/import`, {
    method: "POST",
    headers: cookie ? { cookie } : undefined,
    body: formData,
  });
  const json = (await res.json().catch(() => null)) as ImportResult & { error?: string };
  return { status: res.status, json };
}

function csvFile(content: string, filename = "products.csv") {
  return new File([content], filename, { type: "text/csv" });
}

async function xlsxFile(rows: Record<string, unknown>[], filename = "products.xlsx") {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(headers.map((header) => row[header] ?? ""));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], filename, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("Product import POST /api/companies/:id/products/import", () => {
  it("requires authentication and membership", async () => {
    const owner = await signUpTestUser("owner");
    const outsider = await signUpTestUser("outsider");
    const companyId = await createCompany(owner.cookieHeader, "Import Auth Co");
    const file = csvFile("name\nWidget\n");

    expect((await importFile(undefined, companyId, file)).status).toBe(401);
    expect((await importFile(outsider.cookieHeader, companyId, file)).status).toBe(403);
  });

  it("imports a well-formed CSV and returns accurate counts", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Well Formed Co");
    const csv = [
      "name,price,currency,stock,sku",
      "Widget,19.99,USD,10,WID-1",
      "Gadget,29.99,USD,5,GAD-1",
    ].join("\n");

    const result = await importFile(owner.cookieHeader, companyId, csvFile(csv));
    expect(result.status).toBe(200);
    expect(result.json.queued).toBe(2);
    expect(result.json.skippedCount).toBe(0);

    const products = await waitForProducts(owner.cookieHeader, companyId, 2);
    expect(products.map((p) => p.name).sort()).toEqual(["Gadget", "Widget"]);
    expect(products.find((p) => p.name === "Widget")?.stock).toBe(10);
  });

  it("imports only valid rows from a mix of valid/invalid rows, reporting specific reasons", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Mixed Rows Co");
    const csv = [
      "name,price,currency,stock",
      "Good Widget,10,USD,5",
      ",10,USD,5",
      "No Currency Widget,10,,5",
      "Bad Stock Widget,10,USD,-1",
      "Another Good Widget,,,",
    ].join("\n");

    const result = await importFile(owner.cookieHeader, companyId, csvFile(csv));
    expect(result.status).toBe(200);
    expect(result.json.queued).toBe(2);
    expect(result.json.skippedCount).toBe(3);

    const products = await waitForProducts(owner.cookieHeader, companyId, 2);
    expect(products.map((p) => p.name).sort()).toEqual(["Another Good Widget", "Good Widget"]);
    // Rows are 1-indexed among parsed data rows: row 2 (missing name),
    // row 3 (currency-less price), row 4 (negative stock).
    expect(result.json.skipped).toEqual([
      { row: 2, reason: "name is required" },
      { row: 3, reason: "currency is required when price is present" },
      { row: 4, reason: "stock must be a non-negative integer" },
    ]);
  });

  it("rejects an oversized file with 400", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Oversized Co");
    const oversized = "x".repeat(5 * 1024 * 1024 + 1024);

    const result = await importFile(owner.cookieHeader, companyId, csvFile(oversized));
    expect(result.status).toBe(400);
  });

  it("rejects a file with more than the row limit with 400", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Too Many Rows Co");
    const lines = ["name"];
    for (let i = 0; i < 2001; i++) lines.push(`Widget ${i}`);

    const result = await importFile(owner.cookieHeader, companyId, csvFile(lines.join("\n")));
    expect(result.status).toBe(400);
  });

  it("rejects an unsupported file extension with 400", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Bad Extension Co");
    const file = new File(["name\nWidget\n"], "products.txt", { type: "text/plain" });

    const result = await importFile(owner.cookieHeader, companyId, file);
    expect(result.status).toBe(400);
  });

  it("rejects a corrupt/unparseable file with 400, not 500", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Corrupt File Co");
    const file = new File(["not a real workbook"], "products.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const result = await importFile(owner.cookieHeader, companyId, file);
    expect(result.status).toBe(400);
  });

  it("imports an XLSX file correctly", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "XLSX Co");
    const file = await xlsxFile([
      { name: "Sheet Widget", price: 15.5, currency: "EUR", stock: 3, sku: "SHT-1" },
      { name: "Sheet Gadget", price: 22, currency: "EUR", stock: 0, sku: "SHT-2" },
    ]);

    const result = await importFile(owner.cookieHeader, companyId, file);
    expect(result.status).toBe(200);
    expect(result.json.queued).toBe(2);
    expect(result.json.skippedCount).toBe(0);

    const products = await waitForProducts(owner.cookieHeader, companyId, 2);
    expect(products.find((p) => p.name === "Sheet Widget")?.stock).toBe(3);
  });

  // The route's own top comment explains why: several small inserts (100
  // rows/chunk, so a big file clears Postgres's statement_timeout) must
  // still behave as one all-or-nothing import. This forces a DB-level
  // failure on row 150 (chunk 2 of 2, chunk size 100) that app-level
  // validation doesn't catch -- `currency` is only checked for presence
  // (validatePriceCurrency), not length, so a value past the column's
  // `varchar(3)` limit sails through validation and only fails at insert
  // time. Chunk 1 (rows 1-100) commits fine before chunk 2 fails; the test
  // asserts that commit gets rolled back too, not just that chunk 2 never
  // landed.
  it("rolls back every already-inserted chunk when a later chunk fails at the DB", async () => {
    const owner = await signUpTestUser("owner");
    const companyId = await createCompany(owner.cookieHeader, "Rollback Co");

    const lines = ["name,price,currency,stock,sku"];
    for (let i = 1; i <= 149; i++) lines.push(`Widget ${i},10,USD,5,ROLLBACK-${i}`);
    // Row 150: passes mapAndValidateRow (currency is merely non-empty) but
    // violates products.currency's varchar(3) at insert time.
    lines.push("Widget 150,10,TOOLONG,5,ROLLBACK-150");

    const result = await importFile(owner.cookieHeader, companyId, csvFile(lines.join("\n")));
    expect(result.status).toBe(200);
    expect(result.json.queued).toBe(150);
    expect(result.json.skippedCount).toBe(0);

    // No poll-for-presence here (there's nothing successful to wait for) --
    // give the background insert + rollback (fast with embeddings disabled)
    // a generous fixed window to fully settle, then assert the end state is
    // zero, not the 100 rows chunk 1 alone would have committed.
    await new Promise((r) => setTimeout(r, 3000));
    const res = await api<{ total: number }>(
      "GET",
      `/api/companies/${companyId}/products?pageSize=1`,
      owner.cookieHeader,
    );
    expect(res.json.total).toBe(0);
  });
});
