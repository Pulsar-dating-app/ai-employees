import { createClient } from "@/lib/supabase/server";
import { getCurrentAccess } from "@/lib/auth/company-access";
import { getSchedulingWarnings } from "@/lib/scheduling/warnings";
import { SchedulingTabs } from "./scheduling-tabs";

// Shared chrome for the Scheduling area (Trello K5). Each child page still
// renders its own PageHeader — the sub-tabs sit above it, so switching
// screens keeps the same navigation anchored in place.
export default async function SchedulingLayout({ children }: { children: React.ReactNode }) {
  // A member's agenda and own schedule are reached from the sidebar; the
  // sub-tabs (services, professionals, settings) are all admin pages.
  const access = await getCurrentAccess();
  if (!access.isAdmin) return <div className="flex flex-col gap-8">{children}</div>;

  const supabase = await createClient();
  const { data: companies } = await supabase.from("companies").select("id");
  const companyId = companies?.[0]?.id ?? null;

  // Same facts dashboard/layout.tsx rolls up into the sidebar's Scheduling
  // nav item, fetched again here (cheap head:true counts) since this is a
  // separate route segment with no prop channel from the outer layout --
  // this is what drives the Services/Settings sub-tab warning icons.
  const warnings = companyId
    ? await getSchedulingWarnings(supabase, companyId)
    : { calendarNotConnected: false, businessHoursEmpty: false, servicesEmpty: false };

  return (
    <div className="flex flex-col gap-8">
      <SchedulingTabs
        servicesNeedAttention={warnings.servicesEmpty}
        settingsNeedAttention={warnings.calendarNotConnected || warnings.businessHoursEmpty}
      />
      {children}
    </div>
  );
}
