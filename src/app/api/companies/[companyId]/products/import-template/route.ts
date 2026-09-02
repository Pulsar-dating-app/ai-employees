import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveLocale } from "@/i18n/request";

// Trello F3 follow-up — a downloadable starter file matching exactly the
// columns Trello B4's import route expects (see ../import/route.ts's
// mapAndValidateRow: name, description, price, currency, stock, image,
// product_url, category, sku). Header names are fixed English regardless of
// locale — they're the literal keys the parser reads — only the illustrative
// example row content is localized, via the same locale resolution the rest
// of the app's Server Components use.
//
// The example `description` is deliberately written as a model of the
// specificity merchants should aim for (size/material/fit, not "nice shirt")
// — there's no structured attributes/variants field to fall back on
// (removed; see decisions.md), so description is the only place the AI gets
// this kind of detail from, and this template is one of the few places a
// merchant sees a worked example before writing their own.

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

const HEADER = ["name", "description", "price", "currency", "stock", "image", "product_url", "category", "sku"];

function csvEscape(value: string): string {
  if (/["\n,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildExampleRows(locale: "en" | "pt"): string[][] {
  if (locale === "pt") {
    return [
      [
        "Camiseta Exemplo",
        "Camiseta 100% algodão, gola redonda, caimento levemente justo. Disponível nas cores azul e vermelho, tamanhos P, M e G — informe qual cor e tamanho ao perguntar sobre estoque.",
        "29.90",
        "BRL",
        "10",
        "https://example.com/imagem.jpg",
        "https://example.com/produto",
        "Roupas",
        "SKU-001",
      ],
      // Only `name` is required — this row shows every other column can be left blank.
      ["Caneca Exemplo", "", "", "", "", "", "", "", ""],
    ];
  }

  return [
    [
      "Example T-Shirt",
      "100% cotton, crew neck, slightly fitted cut. Available in blue and red, sizes S/M/L — mention the color and size when asking about stock.",
      "29.90",
      "USD",
      "10",
      "https://example.com/image.jpg",
      "https://example.com/product",
      "Clothing",
      "SKU-001",
    ],
    ["Example Mug", "", "", "", "", "", "", "", ""],
  ];
}

export async function GET(
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

  const locale = await resolveLocale();
  const rows = [HEADER, ...buildExampleRows(locale)];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="product-import-template.csv"',
    },
  });
}
