import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ClockIcon } from "@/components/ui/icons";
import { PageHeader } from "../../page-header";
import { ServicesManager } from "./services-manager";

const PAGE_SIZE = 20;

// Trello K1 — the merchant-facing half of H1's services CRUD, built as a
// close relative of the Products page (F3): same server-fetch-then-hydrate
// shape, same filters/table/dialog trio, same member-not-admin edit gate.
// `services` has no embedding/tsvector columns, so unlike products there's
// no PRODUCT_PUBLIC_COLUMNS equivalent to guard against — select("*") is
// already safe here.
//
// Deliberately NOT wired into the sidebar: that's K5's ticket, which folds
// Scheduling in as a top-level tab once K4 also exists.
export default async function ServicesPage() {
  const supabase = await createClient();
  const t = await getTranslations("Services");

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
        <PageHeader icon={ClockIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />
        <p className="text-sm text-on-surface-variant">{t("noCompany")}</p>
        <Link href="/dashboard">
          <Button type="button">{t("browseMarketplace")}</Button>
        </Link>
      </div>
    );
  }

  const [{ data: membership }, { data: services, count }, { data: defaultService }] = await Promise.all([
    supabase
      .from("company_users")
      .select("role")
      .eq("company_id", company.id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("services")
      .select("*", { count: "exact" })
      .eq("company_id", company.id)
      .eq("is_default", false)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(0, PAGE_SIZE - 1),
    supabase
      .from("services")
      .select("*")
      .eq("company_id", company.id)
      .eq("is_default", true)
      .maybeSingle(),
  ]);

  // Matches Products: H1's routes only ever call requireMember, never
  // requireAdmin, so gating the UI on admin here would invent a restriction
  // the API doesn't enforce.
  const canEdit = membership !== null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={ClockIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      {!canEdit ? (
        <p className="rounded-md border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface-variant">
          {t("readOnlyBanner")}
        </p>
      ) : null}

      <ServicesManager
        companyId={company.id}
        companyCurrency={company.currency}
        canEdit={canEdit}
        initialServices={services ?? []}
        initialTotal={count ?? 0}
        pageSize={PAGE_SIZE}
        defaultService={defaultService ?? null}
      />
    </div>
  );
}
