import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentAccess, type CompanyRole } from "@/lib/auth/company-access";
import {
  canManageProfessional,
  getProfessional,
  listProfessionals,
} from "@/lib/professionals/repository";
import { SettingsBlock } from "@/components/ui/settings-block";
import { BackLink } from "../../../back-link";
import { TimeOffCard, type TimeOffEntry } from "../../settings/time-off-card";
import { GoogleCalendarCard } from "../../settings/google-calendar-card";
import type { BusinessHourRow } from "../../settings/business-hours-card";
import { ProfessionalIdentityCard } from "./professional-identity-card";
import { ProfessionalHoursCard } from "./professional-hours-card";

// 2026-09-24 -- one professional's own schedule: name and login email, the
// services they perform, their working hours (the establishment's, or their
// own), their time off, and their Google Calendar. Owners/admins see and edit
// every professional; since 2026-09-25 a team member (role `member`) reaches
// only their own ("Minha agenda"), with the name read-only.
export default async function ProfessionalPage({ params }: { params: Promise<{ professionalId: string }> }) {
  const { professionalId } = await params;
  const supabase = await createClient();
  const t = await getTranslations("Scheduling.professionals");

  const [
    {
      data: { user },
    },
    { data: companies },
  ] = await Promise.all([supabase.auth.getUser(), supabase.from("companies").select("id")]);
  const company = companies?.[0] ?? null;
  if (!company || !user) notFound();

  const professional = await getProfessional(supabase, company.id, professionalId);
  if (!professional) notFound();

  const access = await getCurrentAccess();
  if (!access.isAdmin && professional.userId !== user.id) redirect("/dashboard/scheduling");

  const today = new Date().toISOString().slice(0, 10);
  const [
    canManage,
    { data: hourRows },
    { data: timeOff },
    { data: services },
    activeProfessionals,
  ] = await Promise.all([
    canManageProfessional(supabase, company.id, professionalId, user.id),
    supabase
      .from("business_hours")
      .select("day_of_week, start_time, end_time, is_active, professional_id")
      .eq("company_id", company.id)
      .or(`professional_id.is.null,professional_id.eq.${professionalId}`)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true }),
    supabase
      .from("company_time_off")
      .select("id, start_date, end_date, reason")
      .eq("company_id", company.id)
      .eq("professional_id", professionalId)
      .gte("end_date", today)
      .order("start_date", { ascending: true }),
    supabase
      .from("services")
      .select("id, name")
      .eq("company_id", company.id)
      .eq("is_default", false)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    listProfessionals(supabase, company.id),
  ]);
  const isAdmin = access.isAdmin;

  // Which active services this professional performs: explicitly linked, or
  // unrestricted (no one linked at all).
  const serviceRows = (services ?? []) as { id: string; name: string }[];
  const { data: links } = await supabase
    .from("professional_services")
    .select("service_id, professional_id")
    .eq("company_id", company.id);
  const linkedByService = new Map<string, string[]>();
  for (const link of (links ?? []) as { service_id: string; professional_id: string }[]) {
    linkedByService.set(link.service_id, [...(linkedByService.get(link.service_id) ?? []), link.professional_id]);
  }
  const performed = serviceRows
    .filter((service) => {
      const linked = linkedByService.get(service.id) ?? [];
      return linked.length === 0 || linked.includes(professionalId);
    })
    .map((service) => service.name);

  // The linked account's email. public.users is only readable for yourself,
  // so it comes through the service client, for this one account.
  let accountEmail: string | null = null;
  let accountRole: CompanyRole | null = null;
  if (professional.userId) {
    const service = createServiceClient();
    const [{ data: account }, { data: seat }] = await Promise.all([
      service.from("users").select("email").eq("id", professional.userId).maybeSingle(),
      service
        .from("company_users")
        .select("role")
        .eq("company_id", company.id)
        .eq("user_id", professional.userId)
        .maybeSingle(),
    ]);
    accountEmail = (account?.email as string | undefined) ?? null;
    accountRole = (seat?.role as CompanyRole | undefined) ?? null;
  }

  const rows = (hourRows ?? []) as (BusinessHourRow & { professional_id: string | null })[];
  const establishmentRows = rows.filter((r) => r.professional_id === null);
  const ownRows = rows.filter((r) => r.professional_id === professionalId);
  const multiple = activeProfessionals.length > 1;

  return (
    <div className="flex flex-col gap-6">
      {isAdmin ? (
        <BackLink href="/dashboard/scheduling/professionals">{t("backToList")}</BackLink>
      ) : (
        <BackLink href="/dashboard/scheduling">{t("backToAgenda")}</BackLink>
      )}
      <div>
        <h1 className="text-headline-lg font-semibold tracking-tight text-on-surface">{professional.name}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          {professional.isActive ? t("detailSubtitle") : t("inactiveSubtitle")}
        </p>
      </div>

      <div className="flex max-w-4xl flex-col gap-6">
        <ProfessionalIdentityCard
          companyId={company.id}
          professionalId={professionalId}
          initialName={professional.name}
          inviteEmail={professional.inviteEmail}
          accountEmail={accountEmail}
          accountUserId={professional.userId}
          accountRole={accountRole}
          isSelf={professional.userId === user.id}
          viewerRole={access.role ?? "member"}
        />

        <SettingsBlock id="services" title={t("servicesTitle")} description={t("servicesSubtitle")}>
          {performed.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{t("noServices")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {performed.map((name) => (
                <li
                  key={name}
                  className="rounded-full bg-surface-container px-3 py-1 text-[13px] font-medium text-on-surface"
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
          {isAdmin ? (
            <Link
              href="/dashboard/scheduling/services"
              className="self-start text-sm font-medium text-primary hover:underline"
            >
              {t("editServicesLink")}
            </Link>
          ) : null}
        </SettingsBlock>

        <ProfessionalHoursCard
          companyId={company.id}
          professionalId={professionalId}
          canManage={canManage}
          usesCustomHours={professional.usesCustomHours}
          establishmentRows={establishmentRows}
          ownRows={ownRows}
        />

        <TimeOffCard
          companyId={company.id}
          canEdit={canManage}
          initialEntries={(timeOff ?? []) as TimeOffEntry[]}
          professionalId={professionalId}
          title={t("timeOffTitle")}
          description={t("timeOffSubtitle")}
        />

        <GoogleCalendarCard
          companyId={company.id}
          professionalId={professionalId}
          canManage={canManage}
          googleClientId={process.env.GOOGLE_CLIENT_ID ?? null}
          description={multiple ? t("googleSubtitle", { name: professional.name }) : undefined}
        />
      </div>
    </div>
  );
}
