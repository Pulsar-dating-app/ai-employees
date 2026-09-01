import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT_PUBLIC_COLUMNS } from "@/lib/products/columns";
import { defaultAgentName } from "@/lib/agents/naming";
import { Button } from "@/components/ui/button";
import { PackageIcon } from "@/components/ui/icons";
import { PageHeader } from "../page-header";
import { LockedPage } from "../locked-page";
import { ProductsManager } from "./products-manager";

// Products exists to serve Malu — no catalog, nothing for her to sell from.
const REQUIRED_AGENT_SLUG = "malu";

const PAGE_SIZE = 20;

export default async function ProductsPage() {
  const supabase = await createClient();
  const t = await getTranslations("Products");

  // user/companies don't depend on each other — fire both at once instead
  // of paying two sequential round-trips to the remote Supabase project
  // (same convention every other dashboard page follows).
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

  // Membership, hire status, and the first page of products all only depend
  // on company.id, not on each other — parallelize.
  const [{ data: membership }, { data: hiredAgents }, { data: products, count }] = await Promise.all([
    supabase
      .from("company_users")
      .select("role")
      .eq("company_id", company.id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase.from("company_agents").select("agents(slug)").eq("company_id", company.id),
    supabase
      .from("products")
      .select(PRODUCT_PUBLIC_COLUMNS, { count: "exact" })
      .eq("company_id", company.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1),
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

  // Deliberately not owner/admin-gated like Settings' canEdit — B3's product
  // routes only ever call requireMember, never requireAdmin, so any member
  // can create/edit/deactivate products. Matching Settings' stricter gate
  // here would invent a restriction the API doesn't enforce.
  const canEdit = membership !== null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={PackageIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      {!canEdit ? (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-on-surface-variant">
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
