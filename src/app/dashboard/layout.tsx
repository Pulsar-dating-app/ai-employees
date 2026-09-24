import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_PATHS, resolveOnboardingState } from "@/lib/companies/onboarding-step";
import {
  isBillingPastDue as checkBillingPastDue,
  isSilentForNoPlan as checkSilentForNoPlan,
} from "@/lib/billing/activation";
import { getUsageSummary } from "@/lib/billing/usage-summary";
import { countFilledSections, SETTINGS_MIN_SECTIONS } from "@/lib/companies/settings-completeness";
import { getSchedulingWarnings } from "@/lib/scheduling/warnings";
import { buildSetupChecklist, loadPlanAndChannelFacts } from "@/lib/setup/checklist";
import { TourProvider } from "@/components/tour/tour-provider";
import { Sidebar, type Attention } from "./sidebar";
import { TopBar } from "./top-bar";
import { DashboardBackdrop } from "./backdrop";

// The whole authenticated app is off-limits to crawlers. `proxy.ts` already
// bounces logged-out `/dashboard*` requests to `/login`, so this is belt-and
// -braces, but it also covers any future public-ish dashboard sub-route.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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
    supabase.from("companies").select("id, name, onboarding_completed_at"),
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

  // ...and a merchant who walked out mid-flow is put back where they stopped,
  // rather than dropped in a dashboard for a hire that cannot work yet. Only
  // costs a query for someone who has not finished: the flag rides along on
  // the companies select above, and a finished company short-circuits here.
  if (user && companies?.[0] && !companies[0].onboarding_completed_at) {
    const state = await resolveOnboardingState(supabase);
    if (state.step !== "done") redirect(ONBOARDING_PATHS[state.step]);
  }

  const hiredAgentSlugs = ((hired ?? []) as unknown as { agents: { slug: string } | null }[])
    .map((row) => row.agents?.slug)
    .filter((slug): slug is string => Boolean(slug));

  const companyId = companies?.[0]?.id ?? null;
  const [
    isBillingPastDue,
    isSilentForNoPlan,
    usage,
    productsCount,
    settingsFields,
    schedulingWarnings,
    planAndChannel,
  ] = companyId
    ? await Promise.all([
        checkBillingPastDue(companyId, supabase),
        checkSilentForNoPlan(companyId, supabase),
        getUsageSummary(companyId, supabase),
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("is_active", true),
        supabase
          .from("companies")
          .select("description, payment_policy, additional_information, faq")
          .eq("id", companyId)
          .maybeSingle(),
        getSchedulingWarnings(supabase, companyId),
        loadPlanAndChannelFacts(supabase, companyId),
      ])
    : [
        false,
        false,
        null,
        { count: 0 },
        { data: null },
        { calendarNotConnected: false, businessHoursEmpty: false, servicesEmpty: false },
        { planChosen: false, channelLive: false },
      ];

  const silence = isBillingPastDue ? "past_due" : isSilentForNoPlan ? "no_plan" : null;

  const filledSections = settingsFields.data ? countFilledSections(settingsFields.data) : 0;
  const hasMalu = hiredAgentSlugs.includes("malu");
  const hasAna = hiredAgentSlugs.includes("ana");
  const attention: Attention = {
    settings:
      silence === "past_due"
        ? "problem"
        : filledSections < SETTINGS_MIN_SECTIONS || !planAndChannel.planChosen
          ? "setup"
          : null,
    products: hasMalu && (productsCount.count ?? 0) === 0 ? "setup" : null,
    scheduling:
      hasAna &&
      (schedulingWarnings.calendarNotConnected ||
        schedulingWarnings.businessHoursEmpty ||
        schedulingWarnings.servicesEmpty)
        ? "setup"
        : null,
  };
  const setupSteps = companyId
    ? buildSetupChecklist({
        hiredSlugs: hiredAgentSlugs,
        planChosen: planAndChannel.planChosen,
        businessInfoFilled: filledSections >= SETTINGS_MIN_SECTIONS,
        productsCount: productsCount.count ?? 0,
        hasOpenHours: !schedulingWarnings.businessHoursEmpty,
        hasServices: !schedulingWarnings.servicesEmpty,
        calendarAvailable: Boolean(process.env.GOOGLE_CLIENT_ID),
        calendarConnected: !schedulingWarnings.calendarNotConnected,
        channelLive: planAndChannel.channelLive,
      })
    : [];

  return (
    <TourProvider>
      <div className="relative min-h-screen bg-surface">
        <DashboardBackdrop />
        <Sidebar
          companyName={companies?.[0]?.name ?? null}
          email={user?.email ?? null}
          locale={locale as "en" | "pt"}
          hiredAgentSlugs={hiredAgentSlugs}
          silence={silence}
          usage={usage}
          attention={attention}
          setupSteps={setupSteps}
        />
        <div className="relative z-10 sm:pl-64">
          <TopBar locale={locale as "en" | "pt"} silence={silence} />
          <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-20 sm:px-10 sm:pb-12 sm:pt-8">{children}</main>
        </div>
      </div>
    </TourProvider>
  );
}
