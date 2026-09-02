import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { BusinessInfoSection } from "./business-info-section";
import { PolicySection } from "./policy-section";
import { FaqSection } from "./faq-section";
import { EmbedDomainsSection } from "./embed-domains-section";
import { CartIcon, ChevronRightIcon, SettingsIcon } from "@/components/ui/icons";
import { PageHeader } from "../page-header";

function countFilledSections(company: {
  description: string | null;
  payment_policy: string | null;
  additional_information: string | null;
  faq: unknown[] | null;
}): number {
  return [
    Boolean(company.description),
    Boolean(company.payment_policy),
    Array.isArray(company.faq) && company.faq.length > 0,
    Boolean(company.additional_information),
  ].filter(Boolean).length;
}

// Company-wide settings — the business knowledge every hired team member
// draws on. Lives at the top level, not under a specific hired agent: it's
// a fact about the company, not about who's hired.
//
// Exception: Shipping and Returns policy moved to Malu's own Connections
// page (my-agents/[agentSlug]/page.tsx) — user-driven, since that content
// is only ever relevant to her sales conversations, never Ana's scheduling
// ones. Still the same `companies.shipping_policy`/`return_policy` columns,
// same `PolicySection` component, just mounted somewhere else; nothing
// moved at the data layer. Payment/Other stayed here — genuinely
// company-wide, not tied to one agent's own conversations the way
// shipping/returns are.
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

  // Every account has a company by the time it reaches /dashboard (the shell
  // layout redirects to /onboarding otherwise). This is just belt-and-braces
  // for a direct hit mid-signup.
  if (!company) redirect("/onboarding");

  const { data: membership } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", company.id)
    .eq("user_id", user!.id)
    .maybeSingle();
  const canEdit = membership ? ["owner", "admin"].includes(membership.role) : false;

  const totalSections = 4;
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

      <Link
        href="/dashboard/settings/billing"
        className="flex max-w-4xl items-center gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-level1 transition-colors hover:bg-surface-container-low"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
          <CartIcon className="h-5 w-5" />
        </span>
        <span className="flex flex-col">
          <span className="text-label-md font-semibold text-on-surface">{t("billingLink.title")}</span>
          <span className="text-sm text-on-surface-variant">{t("billingLink.hint")}</span>
        </span>
        <ChevronRightIcon className="ml-auto h-5 w-5 shrink-0 text-on-surface-variant" />
      </Link>

      <div className="flex max-w-4xl flex-col gap-6">
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

        {/* The two remaining single-field policy sections read as a
            monotonous form stack one-per-row; a grid gives the page real
            structure. (Shipping/Returns used to sit here too — moved to
            Malu's own Connections page, see this page's own top comment.) */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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

        <EmbedDomainsSection
          companyId={company.id}
          canEdit={canEdit}
          initialDomains={company.allowed_embed_domains ?? []}
        />
      </div>
    </div>
  );
}
