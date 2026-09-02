import { NextResponse } from "next/server";

// Shared bearer check for the /api/cron/* routes (N6 established the
// pattern; R4 is the second). Returns a response to send back when the
// request isn't authorized, or null when it is. CRON_SECRET missing is a
// 500 (misconfiguration, fail loud); a wrong/absent bearer is a 401.
export function cronAuthError(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
