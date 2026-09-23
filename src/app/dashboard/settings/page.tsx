import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { SETTINGS_MIN_SECTIONS } from "@/lib/companies/settings-completeness";
import { isBillingPastDue } from "@/lib/billing/activation";
import { StatusBanner } from "@/components/ui/status-banner";
import { BusinessInfoSection } from "./business-info-section";
import { PolicySection } from "./policy-section";
import { FaqSection } from "./faq-section";
import { SettingsShell } from "./settings-shell";
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
  if (!company) redirect("/onboarding");

  const { data: membership } = await supabase
    .from("company_users")
    .select("role")
    .eq("company_id", company.id)
    .eq("user_id", user!.id)
    .maybeSingle();
  const canEdit = membership ? ["owner", "admin"].includes(membership.role) : false;
  const pastDue = await isBillingPastDue(company.id, supabase);

  const faq = Array.isArray(company.faq) ? (company.faq as { question: string; answer: string }[]) : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">{t("pageTitle")}</h1>

      {pastDue ? (
        <StatusBanner
          tone="error"
          title={t("pastDueAlert.title")}
          body={t("pastDueAlert.body")}
          action={
            <Link
              href="/dashboard/settings/billing"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-error px-5 text-label-md font-semibold text-on-error transition-[filter] hover:brightness-95"
            >
              {t("pastDueAlert.action")}
            </Link>
          }
        />
      ) : null}

      {!canEdit ? (
        <p className="rounded-2xl bg-surface-container px-4 py-3 text-sm text-on-surface-variant">
          {t("readOnlyBanner")}
        </p>
      ) : null}

      <SettingsShell
        minSections={SETTINGS_MIN_SECTIONS}
        initialFilled={{
          about: Boolean(company.description),
          contact: false,
          payments: Boolean(company.payment_policy),
          faq: Boolean(faq && faq.length > 0),
          other: Boolean(company.additional_information),
        }}
      >
        <BusinessInfoSection
          companyId={company.id}
          canEdit={canEdit}
          initial={{
            name: company.name,
            description: company.description,
            email: company.email,
            phone: company.phone,
            website_url: company.website_url,
            address: company.address ?? null,
            country: company.country,
            industry: company.industry ?? null,
            currency: company.currency,
            timezone: company.timezone ?? null,
          }}
        />
        <PolicySection
          companyId={company.id}
          fieldName="payment_policy"
          sectionKey="payments"
          initialValue={company.payment_policy}
          canEdit={canEdit}
        />
        <FaqSection companyId={company.id} canEdit={canEdit} initialFaq={faq} />
        <PolicySection
          companyId={company.id}
          fieldName="additional_information"
          sectionKey="other"
          initialValue={company.additional_information}
          canEdit={canEdit}
        />
      </SettingsShell>
    </div>
  );
}
