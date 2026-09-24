import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/lib/auth/actions";
import { acknowledgeRemovalAndStart } from "@/lib/team/actions";
import { pendingRemovalNotice } from "@/lib/team/roles";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// 2026-09-25 -- where someone removed from a company lands when they log in
// again (dashboard/layout.tsx sends them here instead of onboarding). Says
// plainly what happened, then lets them either set up a business of their own
// or leave. Being added back by email puts them straight into that company
// again, so there's nothing to "request" here.
export default async function AccessRemovedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companies } = await supabase.from("companies").select("id").limit(1);
  if (companies && companies.length > 0) redirect("/dashboard");

  const notice = await pendingRemovalNotice(supabase, user.id);
  if (!notice) redirect("/onboarding");

  const t = await getTranslations("AccessRemoved");

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <section className="flex w-full max-w-md flex-col gap-6 rounded-[24px] border border-outline-variant/60 bg-surface-container-lowest p-7 shadow-level1 sm:p-9">
        <div className="flex flex-col gap-2">
          <h1 className="text-headline-sm font-semibold tracking-tight text-on-surface [text-wrap:balance]">
            {t("title", { company: notice.companyName })}
          </h1>
          <p className="text-body-md text-on-surface-variant">{t("body", { company: notice.companyName })}</p>
        </div>
        <div className="flex flex-col gap-2">
          <form action={acknowledgeRemovalAndStart}>
            <Button type="submit" className="w-full">
              {t("startOwn")}
            </Button>
          </form>
          <form action={logout}>
            <Button type="submit" variant="ghost" className="w-full">
              {t("logout")}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
