import { notFound } from "next/navigation";
import { DevWhatsAppConnectTestClient } from "./client";

// TODO(D1-TEST-ONLY): delete this entire folder once Trello F4 ships the
// real connection screen. TEMPORARY DEV-ONLY TEST HARNESS -- Trello D1. See
// client.tsx for the full explanation. This Server Component's only job is
// reading the server-only META_APP_ID/META_WHATSAPP_CONFIG_ID env vars and
// handing them down as props -- neither is secret enough to avoid this, but
// there's no reason to duplicate them under NEXT_PUBLIC_ names just for
// this one throwaway page.

export default function DevWhatsAppConnectTestPage() {
  // Gated at render time, not module scope: throwing at module evaluation
  // breaks `next build`'s page-data collection for this route entirely
  // (NODE_ENV is "production" during build, not just at request time),
  // even though nothing ever links here in production.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <DevWhatsAppConnectTestClient
      metaAppId={process.env.META_APP_ID ?? ""}
      metaConfigId={process.env.META_WHATSAPP_CONFIG_ID ?? ""}
    />
  );
}
