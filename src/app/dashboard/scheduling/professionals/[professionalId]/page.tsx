import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
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
import { ProfessionalIdentityCard, type MemberOption } from "./professional-identity-card";
import { ProfessionalHoursCard } from "./professional-hours-card";

// 2026-09-24 -- one professional's own schedule: name and linked team member,
// the services they perform, their working hours (the establishment's, or
// their own), their time off, and their Google Calendar. Editable by company
// owners/admins, and by the team member linked to this professional; every
// other member sees it read-only.
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

  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: membership },
    canManage,
    { data: hourRows },
    { data: timeOff },
    { data: services },
    activeProfessionals,
  ] = await Promise.all([
    supabase.from("company_users").select("role").eq("company_id", company.id).eq("user_id", user.id).maybeSingle(),
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
  const isAdmin = ["owner", "admin"].includes(membership?.role ?? "");

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

  // Team members an admin can link to this professional. public.users is
  // only readable for yourself, so the names/emails come through the
  // service client -- admin-only, scoped to this company's members.
  let members: MemberOption[] = [];
  if (isAdmin) {
    const { data: memberRows } = await createServiceClient()
      .from("company_users")
      .select("user_id, users(email, name)")
      .eq("company_id", company.id);
    type MemberUser = { email: string; name: string | null };
    members = ((memberRows ?? []) as unknown as { user_id: string; users: MemberUser | MemberUser[] | null }[]).map(
      (m) => {
        const account = Array.isArray(m.users) ? m.users[0] : m.users;
        return { userId: m.user_id, label: account?.name?.trim() || account?.email || m.user_id };
      },
    );
  }

  const rows = (hourRows ?? []) as (BusinessHourRow & { professional_id: string | null })[];
  const establishmentRows = rows.filter((r) => r.professional_id === null);
  const ownRows = rows.filter((r) => r.professional_id === professionalId);
  const multiple = activeProfessionals.length > 1;

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/dashboard/scheduling/professionals">{t("backToList")}</BackLink>
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
          initialUserId={professional.userId}
          canManage={canManage}
          isAdmin={isAdmin}
          members={members}
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
          <Link href="/dashboard/scheduling/services" className="self-start text-sm font-medium text-primary hover:underline">
            {t("editServicesLink")}
          </Link>
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
