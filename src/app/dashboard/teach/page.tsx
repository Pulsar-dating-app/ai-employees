import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { BackToDashboardLink } from "../back-link";
import { BusinessInfoSection } from "./business-info-section";
import { PolicySection } from "./policy-section";
import { FaqSection } from "./faq-section";

export default async function TeachPage() {
  const supabase = await createClient();
  const t = await getTranslations("Teach");

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

  const canEdit = membership ? ["owner", "admin"].includes(membership.role) : false;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <BackToDashboardLink />
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900">{t("pageTitle")}</h1>
        <p className="mt-1 text-sm text-neutral-500">{t("pageSubtitle")}</p>
      </div>

      <p className="rounded-md border-l-4 border-accent-500 bg-neutral-50 px-4 py-3 text-sm font-medium text-neutral-800">
        {t("tipBanner")}
      </p>

      {!canEdit ? (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          {t("readOnlyBanner")}
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
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
            currency: company.currency,
          }}
        />

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

        <FaqSection companyId={company.id} canEdit={canEdit} initialFaq={company.faq} />

        <PolicySection
          companyId={company.id}
          fieldName="additional_information"
          sectionKey="other"
          initialValue={company.additional_information}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}
