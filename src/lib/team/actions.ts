"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// 2026-09-25 -- the removed person moves past the "you were removed" notice
// to set up a business of their own. Notices are service-role-write only.
export async function acknowledgeRemovalAndStart(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await createServiceClient()
    .from("company_member_removals")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("acknowledged_at", null);
  if (error) throw error;

  redirect("/onboarding");
}
