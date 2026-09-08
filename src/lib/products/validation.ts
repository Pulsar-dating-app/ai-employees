// Product field validation shared by every write path: B3's CRUD routes,
// B4's CSV/XLSX import, and the Shopify catalogue sync. Extracted here from
// the products route so a non-route caller (the sync lives in src/lib) can
// reuse the exact same rules instead of duplicating or drifting from them.

// price and currency travel together: a price with no currency is
// meaningless money, a currency with no price is noise. Either can be
// absent, but not one without the other.
export function validatePriceCurrency(price: unknown, currency: unknown): string | null {
  if (price === undefined || price === null) return null;

  if (typeof price !== "number" || Number.isNaN(price) || price < 0) {
    return "price must be a number >= 0";
  }

  if (!currency) {
    return "currency is required when price is present";
  }

  return null;
}

// stock is nullable and unconstrained at the DB level -- null means "not
// tracked," 0 means "out of stock." App-layer-only validation, not a DB CHECK.
export function validateStock(stock: unknown): string | null {
  if (stock === undefined || stock === null) return null;
  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
    return "stock must be a non-negative integer";
  }
  return null;
}
