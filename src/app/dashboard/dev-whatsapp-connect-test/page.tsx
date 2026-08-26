import { DevWhatsAppConnectTestClient } from "./client";

// TEMPORARY DEV-ONLY TEST HARNESS -- Trello D1. See client.tsx for the full
// explanation. This Server Component's only job is reading the server-only
// META_APP_ID/META_WHATSAPP_CONFIG_ID env vars and handing them down as
// props -- neither is secret enough to avoid this, but there's no reason to
// duplicate them under NEXT_PUBLIC_ names just for this one throwaway page.
//
// DELETE THIS ENTIRE FOLDER once Trello F4 ships the real connection screen.

if (process.env.NODE_ENV === "production") {
  throw new Error("dev-whatsapp-connect-test is a dev-only page and must not run in production");
}

export default function DevWhatsAppConnectTestPage() {
  return (
    <DevWhatsAppConnectTestClient
      metaAppId={process.env.META_APP_ID ?? ""}
      metaConfigId={process.env.META_WHATSAPP_CONFIG_ID ?? ""}
    />
  );
}
