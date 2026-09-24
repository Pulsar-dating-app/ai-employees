import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { listProfessionalsWithServices } from "@/lib/professionals/repository";
import { Button } from "@/components/ui/button";
import { ProfessionalsManager, type ProfessionalListItem } from "./professionals-manager";

// 2026-09-24 -- the Scheduling area's "Professionals" tab: one schedule per
// professional (see decisions.md "Multiple schedules per company"). Every
// company starts with one, seeded from its name, so a solo business sees a
// single row and a nudge to add more.
export default async function ProfessionalsPage() {
  const supabase = await createClient();
  const t = await getTranslations("Scheduling.professionals");

  const [
    {
      data: { user },
    },
    { data: companies },
  ] = await Promise.all([supabase.auth.getUser(), supabase.from("companies").select("id")]);
  const company = companies?.[0] ?? null;

  if (!company) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-on-surface-variant">{t("noCompany")}</p>
        <Link href="/dashboard">
          <Button type="button">{t("browseMarketplace")}</Button>
        </Link>
      </div>
    );
  }

  const [{ data: membership }, professionals, { data: services }, { data: connections }] = await Promise.all([
    supabase.from("company_users").select("role").eq("company_id", company.id).eq("user_id", user!.id).maybeSingle(),
    listProfessionalsWithServices(supabase, company.id, { includeInactive: true }),
    supabase
      .from("services")
      .select("id, name")
      .eq("company_id", company.id)
      .eq("is_default", false)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase.from("company_calendar_connections").select("professional_id, status").eq("company_id", company.id),
  ]);

  const connected = new Set(
    ((connections ?? []) as { professional_id: string; status: string }[])
      .filter((c) => c.status === "connected")
      .map((c) => c.professional_id),
  );
  const serviceNames = new Map(((services ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  const items: ProfessionalListItem[] = professionals.map((p) => ({
    id: p.id,
    name: p.name,
    isActive: p.isActive,
    position: p.position,
    usesCustomHours: p.usesCustomHours,
    isMe: p.userId === user!.id,
    calendarConnected: connected.has(p.id),
    serviceNames: p.serviceIds.map((id) => serviceNames.get(id)).filter((n): n is string => Boolean(n)),
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">{t("pageTitle")}</h1>
      <ProfessionalsManager
        companyId={company.id}
        isAdmin={["owner", "admin"].includes(membership?.role ?? "")}
        initialProfessionals={items}
      />
    </div>
  );
}
