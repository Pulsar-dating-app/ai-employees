import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "./sidebar";

// Every /dashboard/* route renders under this shell — a persistent dark
// rail on desktop, a top bar + bottom tab bar on mobile (see sidebar.tsx).
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
  ] = await Promise.all([supabase.auth.getUser(), supabase.from("companies").select("name")]);

  return (
    <div className="min-h-screen bg-neutral-50">
      <Sidebar companyName={companies?.[0]?.name ?? null} email={user?.email ?? null} />
      <div className="sm:pl-64">
        <main className="mx-auto max-w-3xl px-4 pt-20 pb-24 sm:px-6 sm:pt-10 sm:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
