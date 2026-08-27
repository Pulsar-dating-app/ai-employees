import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAgentName } from "@/lib/agents/naming";
import { agentPhoto } from "@/lib/agents/media";
import { Button } from "@/components/ui/button";
import { BusinessInfoSection } from "./business-info-section";
import { PolicySection } from "./policy-section";
import { FaqSection } from "./faq-section";
import { PersonaAside } from "./persona-aside";
import { SettingsIcon } from "@/components/ui/icons";
import { PageHeader } from "../page-header";

function countFilledSections(company: {
  description: string | null;
  shipping_policy: string | null;
  return_policy: string | null;
  payment_policy: string | null;
  additional_information: string | null;
  faq: unknown[] | null;
}): number {
  return [
    Boolean(company.description),
    Boolean(company.shipping_policy),
    Boolean(company.return_policy),
    Boolean(company.payment_policy),
    Array.isArray(company.faq) && company.faq.length > 0,
    Boolean(company.additional_information),
  ].filter(Boolean).length;
}

type HiredAgentRow = { agents: { slug: string; role: string | null } | null };

// Company-wide settings — the business knowledge Malu (and any future
// team member) draws on. Lives at the top level, not under a specific
// hired agent: it's a fact about the company, not about who's hired.
export default async function SettingsPage() {
  const supabase = await createClient();
  const t = await getTranslations("Settings");

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
        <PageHeader icon={SettingsIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />
        <p className="text-sm text-on-surface-variant">{t("noCompany")}</p>
        <Link href="/dashboard">
          <Button type="button">{t("browseMarketplace")}</Button>
        </Link>
      </div>
    );
  }

  const [{ data: membership }, { data: hired }] = await Promise.all([
    supabase
      .from("company_users")
      .select("role")
      .eq("company_id", company.id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase.from("company_agents").select("agents(slug, role)").eq("company_id", company.id),
  ]);
  const canEdit = membership ? ["owner", "admin"].includes(membership.role) : false;
  const leadAgent = ((hired as HiredAgentRow[] | null) ?? []).find((r) => r.agents)?.agents ?? null;

  const totalSections = 6;
  const filledSections = countFilledSections(company);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={SettingsIcon} title={t("pageTitle")} subtitle={t("pageSubtitle")} />

      <div className="rounded-md bg-primary-fixed/40 px-4 py-3">
        <p className="text-sm font-semibold text-primary">
          {t("completeness", { filled: filledSections, total: totalSections })}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-primary-fixed">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${(filledSections / totalSections) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-on-surface-variant">{t("completenessHint")}</p>
      </div>

      {!canEdit ? (
        <p className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-surface-variant">
          {t("readOnlyBanner")}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-8">
          <BusinessInfoSection
            companyId={company.id}
            canEdit={canEdit}
            initial={{
              name: company.name,
              description: company.description,
              email: company.email,
              phone: company.phone,
              website_url: company.website_url,
              country: company.country,
              industry: company.industry ?? null,
              currency: company.currency,
            }}
          />

          {/* The four single-field policy sections read as a monotonous form
              stack one-per-row; a grid gives the page real structure. */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <PolicySection
              companyId={company.id}
              fieldName="shipping_policy"
              sectionKey="shipping"
              initialValue={company.shipping_policy}
              canEdit={canEdit}
            />
            <PolicySection
              companyId={company.id}
              fieldName="return_policy"
              sectionKey="returns"
              initialValue={company.return_policy}
              canEdit={canEdit}
            />
            <PolicySection
              companyId={company.id}
              fieldName="payment_policy"
              sectionKey="payments"
              initialValue={company.payment_policy}
              canEdit={canEdit}
            />
            <PolicySection
              companyId={company.id}
              fieldName="additional_information"
              sectionKey="other"
              initialValue={company.additional_information}
              canEdit={canEdit}
            />
          </div>

          <FaqSection companyId={company.id} canEdit={canEdit} initialFaq={company.faq} />
        </div>

        {leadAgent ? (
          <div className="lg:col-span-4">
            <PersonaAside
              name={defaultAgentName(leadAgent.slug)}
              role={leadAgent.role}
              photoSrc={agentPhoto(leadAgent.slug)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
