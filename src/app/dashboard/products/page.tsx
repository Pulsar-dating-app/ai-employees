import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { BackToDashboardLink } from "../back-link";
import { ProductsManager } from "./products-manager";

const PAGE_SIZE = 20;

export default async function ProductsPage() {
  const supabase = await createClient();
  const t = await getTranslations("Products");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: companies } = await supabase.from("companies").select("*");
  const company = companies?.[0] ?? null;

  if (!company) {
    return (
      <div className="flex flex-col gap-4">
        <BackToDashboardLink />
        <h1 className="text-2xl font-semibold text-neutral-900">{t("pageTitle")}</h1>
        <p className="text-sm text-neutral-600">{t("noCompany")}</p>
      </div>
    );
  }

  const { data: membership } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", company.id)
    .eq("user_id", user!.id)
    .maybeSingle();

  // Deliberately not owner/admin-gated like Teach's canEdit — B3's product
  // routes only ever call requireMember, never requireAdmin, so any member
  // can create/edit/deactivate products. Matching Teach's stricter gate here
  // would invent a restriction the API doesn't enforce.
  const canEdit = membership !== null;

  const { data: products, count } = await supabase
    .from("products")
    .select("*", { count: "exact" })
    .eq("company_id", company.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <BackToDashboardLink />
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900">{t("pageTitle")}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t("pageSubtitle")}</p>
      </div>

      {!canEdit ? (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          {t("readOnlyBanner")}
        </p>
      ) : null}

      <ProductsManager
        companyId={company.id}
        companyCurrency={company.currency}
        canEdit={canEdit}
        initialProducts={products ?? []}
        initialTotal={count ?? 0}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
