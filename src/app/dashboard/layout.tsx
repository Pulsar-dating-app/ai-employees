import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { DashboardBackdrop } from "./backdrop";

// Every /dashboard/* route renders under this shell — a persistent light
// rail + sticky top bar on desktop, a top bar + bottom tab bar on mobile
// (see sidebar.tsx / top-bar.tsx). Stitch "Human-Centric AI" admin shell.
// This Server Component only re-runs on a full load / hard navigation, not
// on client-side navigation between sibling pages under it — so fetching
// identity here (for the sidebar's footer) is a one-time cost, not a
// per-tab-click one.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: companies },
    { data: hired },
    locale,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("companies").select("name"),
    // Which agents this company has hired, so the sidebar can hide the tabs
    // that only exist to serve one of them (a barbershop running only Ana
    // has no use for a Products tab). `company_agents`' select policy is
    // `is_company_member(company_id)`, so this is already scoped to the
    // signed-in user's companies without naming one.
    supabase.from("company_agents").select("agents(slug)"),
    getLocale(),
  ]);

  // PostgREST returns `agents` as one embedded object for this to-one
  // relation; the generated types widen it to an array (same cast the
  // metrics and my-agents pages already make).
  const hiredRows = (hired ?? []) as unknown as { agents: { slug: string } | null }[];

  // Hired, not *active* — pausing an agent shouldn't make the merchant's own
  // catalog or schedule disappear out from under them.
  const hiredAgentSlugs = hiredRows
    .map((row) => row.agents?.slug)
    .filter((slug): slug is string => Boolean(slug));

  return (
    <div className="relative min-h-screen bg-surface">
      <DashboardBackdrop />
      <Sidebar
        companyName={companies?.[0]?.name ?? null}
        email={user?.email ?? null}
        locale={locale as "en" | "pt"}
        hiredAgentSlugs={hiredAgentSlugs}
      />
      <div className="relative z-10 sm:pl-64">
        <TopBar locale={locale as "en" | "pt"} />
        <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-20 sm:px-10 sm:pb-12 sm:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
