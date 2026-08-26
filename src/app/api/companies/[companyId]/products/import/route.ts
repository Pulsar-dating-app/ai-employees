import { NextResponse } from "next/server";
import { parse as parseCsvSync } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { validatePriceCurrency, validateStock } from "../route";

// Trello ticket B4 — bulk product import (spec §12: upload -> parse ->
// validate -> report invalid rows -> import valid rows). MVP limits so the
// import runs synchronously within a normal request: 5MB file, 2000 rows.
// Row numbers in the response are 1-indexed positions among the data rows
// actually parsed (blank rows are silently skipped for both formats, same
// as CSV's own skip_empty_lines) — not a literal spreadsheet line number.

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;

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
  variants: unknown | null;
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

  const variantsRaw = cellToString(row.variants);
  let variants: unknown = null;
  if (variantsRaw !== null) {
    try {
      variants = JSON.parse(variantsRaw);
    } catch {
      return { reason: "variants must be valid JSON" };
    }
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
      variants,
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
    return NextResponse.json({ error: "File exceeds the 5MB limit" }, { status: 400 });
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

  let inserted: unknown[] = [];
  if (toInsert.length > 0) {
    const { data, error } = await supabase.from("products").insert(toInsert).select();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    inserted = data ?? [];
  }

  return NextResponse.json({
    imported: inserted.length,
    skippedCount: skipped.length,
    skipped,
    products: inserted,
  });
}
