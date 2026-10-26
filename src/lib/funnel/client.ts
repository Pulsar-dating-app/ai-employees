"use client";

import type { FunnelEvent, FunnelProperties } from "./events";
import { trackFunnelEvent } from "./track";

// Fire-and-forget from a client component. Never awaited by the caller and
// never surfaces an error: a lost event is better than a broken button.
export function track(event: FunnelEvent, properties?: FunnelProperties): void {
  trackFunnelEvent(event, properties).catch(() => {});
}
