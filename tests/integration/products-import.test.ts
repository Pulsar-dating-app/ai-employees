import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { api } from "./helpers/request";
import { getTestEnv } from "./helpers/env";
import { signUpTestUser } from "./helpers/auth";

// Trello ticket B4 — bulk product import via CSV/XLSX upload. Uses raw
// fetch + FormData directly (not the shared `api()` helper, which always
// JSON-stringifies the body) since this endpoint expects multipart/form-data.

interface ImportResult {
  imported: number;
  skippedCount: number;
  skipped: { row: number; reason: string }[];
  products: { id: string; name: string; stock: number | null }[];
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
    expect(result.json.imported).toBe(2);
    expect(result.json.skippedCount).toBe(0);
    expect(result.json.products.map((p) => p.name).sort()).toEqual(["Gadget", "Widget"]);
    expect(result.json.products.find((p) => p.name === "Widget")?.stock).toBe(10);
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
    expect(result.json.imported).toBe(2);
    expect(result.json.skippedCount).toBe(3);
    expect(result.json.products.map((p) => p.name).sort()).toEqual([
      "Another Good Widget",
      "Good Widget",
    ]);
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
    expect(result.json.imported).toBe(2);
    expect(result.json.skippedCount).toBe(0);
    const widget = result.json.products.find((p) => p.name === "Sheet Widget");
    expect(widget?.stock).toBe(3);
  });
});
