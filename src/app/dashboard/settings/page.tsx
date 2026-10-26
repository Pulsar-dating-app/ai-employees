import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { countFilledSections, SETTINGS_MIN_SECTIONS } from "@/lib/companies/settings-completeness";
import { defaultAgentName } from "@/lib/agents/naming";
import { isBillingPastDue } from "@/lib/billing/activation";
import { StatusBanner } from "@/components/ui/status-banner";
import { BusinessInfoSection } from "./business-info-section";
import { PolicySection } from "./policy-section";
import { FaqSection } from "./faq-section";
import { SettingsShell } from "./settings-shell";
import { QuickTeach } from "./quick-teach";
import { requireAdminPage } from "@/lib/auth/company-access";
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ pronto?: string }> }) {
  // Company-level page: owners/admins only (members get their agenda).
  await requireAdminPage();
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
  const [pastDue, { pronto }, { data: hiredRows }] = await Promise.all([
    isBillingPastDue(company.id, supabase),
    searchParams,
    supabase
      .from("company_agents")
      .select("name, agents(slug)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: true })
      .limit(1),
  ]);
  const firstHire = (hiredRows ?? [])[0] as unknown as { name: string | null; agents: { slug: string } | null } | undefined;
  const hireSlug = firstHire?.agents?.slug ?? null;
  const hireName = firstHire?.name ?? (hireSlug ? defaultAgentName(hireSlug) : null);
  // Until the business has enough written down, three quick questions come
  // before the full form (quick-teach.tsx).
  const showQuickTeach = canEdit && Boolean(hireName) && countFilledSections(company) < SETTINGS_MIN_SECTIONS;

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

      {pronto && hireName ? (
        <StatusBanner
          tone="info"
          title={t("quickTeachSaved.title")}
          body={t("quickTeachSaved.body", { name: hireName })}
        />
      ) : null}

      {showQuickTeach ? (
        <QuickTeach
          companyId={company.id}
          agentName={hireName!}
          scheduling={hireSlug === "ana"}
          initial={{
            description: company.description,
            payment_policy: company.payment_policy,
            address: company.address ?? null,
          }}
        />
      ) : null}

      {!canEdit ? (
        <p className="rounded-2xl bg-surface-container px-4 py-3 text-sm text-on-surface-variant">
          {t("readOnlyBanner")}
        </p>
      ) : null}

      {/* Keyed on the row's last update so a save from QuickTeach, which
          refreshes the page, remounts the sections with the new values
          instead of leaving their first-render state on screen. */}
      <SettingsShell
        key={company.updated_at}
        minSections={SETTINGS_MIN_SECTIONS}
        hideLowCompleteness={showQuickTeach}
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
