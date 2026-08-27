import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

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
    locale,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("companies").select("name"),
    getLocale(),
  ]);

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar
        companyName={companies?.[0]?.name ?? null}
        email={user?.email ?? null}
        locale={locale as "en" | "pt"}
      />
      <div className="sm:pl-64">
        <TopBar locale={locale as "en" | "pt"} />
        <main className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-20 sm:px-10 sm:pb-12 sm:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
