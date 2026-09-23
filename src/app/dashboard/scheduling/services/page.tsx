import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ClockIcon } from "@/components/ui/icons";
import { PageHeader } from "../../page-header";
import { ServicesManager } from "./services-manager";

const SERVICES_LIMIT = 1000;

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

  const [{ data: membership }, { data: services }, { data: defaultService }] = await Promise.all([
    supabase.from("company_users").select("role").eq("company_id", company.id).eq("user_id", user!.id).maybeSingle(),
    supabase
      .from("services")
      .select("*")
      .eq("company_id", company.id)
      .eq("is_default", false)
      .order("name", { ascending: true })
      .limit(SERVICES_LIMIT),
    supabase.from("services").select("*").eq("company_id", company.id).eq("is_default", true).maybeSingle(),
  ]);

  const canEdit = membership !== null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">{t("pageTitle")}</h1>

      {!canEdit ? (
        <p className="rounded-2xl bg-surface-container px-4 py-3 text-sm text-on-surface-variant">
          {t("readOnlyBanner")}
        </p>
      ) : null}

      <ServicesManager
        companyId={company.id}
        companyCurrency={company.currency}
        canEdit={canEdit}
        initialServices={services ?? []}
        defaultService={defaultService ?? null}
      />
    </div>
  );
}
