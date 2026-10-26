import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordFunnelEvent } from "@/lib/funnel/record";
import { NUDGE_KINDS, type NudgeKind } from "@/lib/nudges/kinds";

// Where the merchant nudge e-mails link to: records the click, then sends
// them on to the dashboard (which forwards anyone still mid-onboarding to
// their step). Only recorded when the browser that opens the mail already
// has their session -- otherwise the dashboard's login takes over and the
// click goes unmeasured, which is fine for a count.
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("k");
  if (kind && (NUDGE_KINDS as readonly string[]).includes(kind)) {
    await recordFunnelEvent(await createClient(), "nudge_clicked", { kind: kind as NudgeKind });
  }
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
