import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { TourProvider } from "@/components/tour/tour-provider";
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
    supabase.from("companies").select("id, name"),
    // Only used to mute + lock-icon the tabs whose team member isn't hired
    // (the page itself is the real gate). `company_agents`' select policy is
    // `is_company_member`, so this is already scoped to the user's companies.
    // Hired regardless of status — a paused agent shouldn't re-lock its tab.
    supabase.from("company_agents").select("agents(slug)"),
    getLocale(),
  ]);

  // The single guarantee that every /dashboard/* page can assume a company
  // exists: a signed-in user without one is sent to set it up first.
  // Company creation lives only in /onboarding now — not the hire flow, not
  // Settings.
  if (user && (!companies || companies.length === 0)) {
    redirect("/onboarding");
  }

  // Surfaced everywhere in the shell (not just the billing page's own
  // banner) so a merchant sees "your team is paused" no matter which tab
  // they land on. Same past_due/unpaid definition as the billing page's
  // isLapsedPayment.
  const companyId = companies?.[0]?.id ?? null;
  const { data: billing } = companyId
    ? await supabase.from("company_billing").select("subscription_status").eq("company_id", companyId).maybeSingle()
    : { data: null };
  const isBillingPastDue =
    billing?.subscription_status === "past_due" || billing?.subscription_status === "unpaid";

  const hiredAgentSlugs = ((hired ?? []) as unknown as { agents: { slug: string } | null }[])
    .map((row) => row.agents?.slug)
    .filter((slug): slug is string => Boolean(slug));

  return (
    <TourProvider>
      <div className="relative min-h-screen bg-surface">
        <DashboardBackdrop />
        <Sidebar
          companyName={companies?.[0]?.name ?? null}
          email={user?.email ?? null}
          locale={locale as "en" | "pt"}
          hiredAgentSlugs={hiredAgentSlugs}
          isBillingPastDue={isBillingPastDue}
        />
        <div className="relative z-10 sm:pl-64">
          <TopBar locale={locale as "en" | "pt"} isBillingPastDue={isBillingPastDue} />
          <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-20 sm:px-10 sm:pb-12 sm:pt-8">
            {children}
          </main>
        </div>
      </div>
    </TourProvider>
  );
}
