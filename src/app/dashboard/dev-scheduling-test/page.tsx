import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SchedulingTestPanel } from "./panel";

// DEV-ONLY test harness for Epics H (services/business hours/appointments)
// and I (Google Calendar connect/availability/sync) -- there's no real
// dashboard UI for any of this yet (K-epic). Same category as dev-chat-test:
// real API calls against the actual routes, no i18n, no design polish,
// deleted once real UI exists.
//
// The NODE_ENV guard is deliberately INSIDE this function, not at module
// scope -- a module-scope throw breaks `next build`'s page-data collection
// since NODE_ENV is "production" during build regardless of runtime routing
// (this exact bug has hit this codebase three times already, see
// decisions.md's 2026-08-26 entry and its 2026-08-29 recurrence note).
export default async function DevSchedulingTestPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    { data: companies },
  ] = await Promise.all([supabase.auth.getUser(), supabase.from("companies").select("id, name")]);

  if (!user) {
    return <p className="p-8 text-sm text-on-surface-variant">Not authenticated.</p>;
  }

  const company = companies?.[0] ?? null;

  if (!company) {
    return (
      <div className="p-8 text-sm text-on-surface-variant">
        No company yet — create one from the dashboard first, then reload this page.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-lg font-semibold text-on-surface">Dev test — Scheduling (Epics H &amp; I)</h1>
        <p className="text-sm text-on-surface-variant">
          Company: {company.name} ({company.id})
        </p>
      </div>
      <SchedulingTestPanel companyId={company.id} googleClientId={process.env.GOOGLE_CLIENT_ID ?? null} />
    </div>
  );
}
