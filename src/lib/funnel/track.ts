"use server";

import { createClient } from "@/lib/supabase/server";
import { isFunnelEvent, sanitizeFunnelProperties } from "./events";
import { recordFunnelEvent } from "./record";

// The client's way in (see client.ts). Both arguments come from the browser,
// so the name is checked against the allowlist and the properties are
// sanitised before anything is written.
export async function trackFunnelEvent(event: unknown, properties?: unknown): Promise<void> {
  if (!isFunnelEvent(event)) return;
  await recordFunnelEvent(await createClient(), event, sanitizeFunnelProperties(properties));
}
