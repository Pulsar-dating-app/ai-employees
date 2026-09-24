import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT_PUBLIC_COLUMNS } from "@/lib/products/columns";
import { defaultAgentName } from "@/lib/agents/naming";
import { Button } from "@/components/ui/button";
import { StatusBanner } from "@/components/ui/status-banner";
import { PackageIcon } from "@/components/ui/icons";
import { PageHeader } from "../page-header";
import { LockedPage } from "../locked-page";
import { ProductsManager } from "./products-manager";
import { requireAdminPage } from "@/lib/auth/company-access";

const REQUIRED_AGENT_SLUG = "malu";
const PAGE_SIZE = 20;

export default async function ProductsPage() {
  // Company-level page: owners/admins only (members get their agenda).
  await requireAdminPage();
  const supabase = await createClient();
  const t = await getTranslations("Products");

  const [
    {
      data: { user },
    },
    { data: companies },
  ] = await Promise.all([supabase.auth.getUser(), supabase.from("companies").select("*")]);
  const company = companies?.[0] ?? null;

  if (!company) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader icon={PackageIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />
        <p className="text-sm text-on-surface-variant">{t("noCompany")}</p>
        <Link href="/dashboard">
          <Button type="button">{t("browseMarketplace")}</Button>
        </Link>
      </div>
    );
  }

  const [
    { data: membership },
    { data: hiredAgents },
    { data: products, count },
    { count: inactiveCount },
    { data: categoryRows, error: categoryError },
  ] = await Promise.all([
    supabase.from("company_users").select("role").eq("company_id", company.id).eq("user_id", user!.id).maybeSingle(),
    supabase.from("company_agents").select("agents(slug)").eq("company_id", company.id),
    supabase
      .from("products")
      .select(PRODUCT_PUBLIC_COLUMNS, { count: "exact" })
      .eq("company_id", company.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .eq("is_active", false),
    supabase.rpc("product_categories", { p_company_id: company.id }),
  ]);

  const hiredSlugs = ((hiredAgents ?? []) as unknown as { agents: { slug: string } | null }[])
    .map((r) => r.agents?.slug)
    .filter((s): s is string => Boolean(s));

  if (!hiredSlugs.includes(REQUIRED_AGENT_SLUG)) {
    const tl = await getTranslations("Dashboard.locked");
    const name = defaultAgentName(REQUIRED_AGENT_SLUG);
    return (
      <LockedPage
        icon={PackageIcon}
        pageTitle={t("pageTitle")}
        pageSubtitle={t("pageSubtitle")}
        title={tl("title", { name })}
        body={tl("body", { name })}
        ctaLabel={tl("cta", { name })}
        ctaHref={`/dashboard/agents/${REQUIRED_AGENT_SLUG}`}
      />
    );
  }

  const canEdit = membership !== null;
  const canManageConnection = membership?.role === "owner" || membership?.role === "admin";
  const activeCount = count ?? 0;
  let categoryNames = ((categoryRows ?? []) as { category: string }[]).map((r) => r.category);
  if (categoryError) {
    const { data: scanned } = await supabase
      .from("products")
      .select("category")
      .eq("company_id", company.id)
      .eq("is_active", true)
      .not("category", "is", null);
    categoryNames = [
      ...new Set(((scanned ?? []) as { category: string | null }[]).map((r) => r.category ?? "").filter(Boolean)),
    ];
  }
  const categories = categoryNames.sort((a, b) => a.localeCompare(b));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">{t("pageTitle")}</h1>
      {activeCount === 0 && (inactiveCount ?? 0) > 0 ? (
        <StatusBanner tone="warn" title={t("emptyAlert.title")} body={t("emptyAlert.body")} />
      ) : null}
      {!canEdit ? <StatusBanner tone="info" title={t("catalog.readOnlyTitle")} body={t("readOnlyBanner")} /> : null}
      <Suspense fallback={null}>
        <ProductsManager
          companyId={company.id}
          companyCurrency={company.currency}
          canEdit={canEdit}
          canManageConnection={canManageConnection}
          categories={categories}
          activeCount={activeCount}
          inactiveCount={inactiveCount ?? 0}
          initialProducts={products ?? []}
          initialTotal={activeCount}
          pageSize={PAGE_SIZE}
        />
      </Suspense>
    </div>
  );
}
