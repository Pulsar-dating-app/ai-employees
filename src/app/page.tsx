import { Suspense } from "react";
import { redirect } from "next/navigation";
import Script from "next/script";
import { createClient } from "@/lib/supabase/server";
import { LandingPageV2 } from "@/components/landing/landing-page-2";
import { AuthModalController } from "@/components/auth/auth-modal-controller";

// Signed-in visitors go straight to the app; everyone else sees the real
// public landing page instead of being bounced to /login. Login / sign-up
// are overlays on this page, driven by the `?auth=` query param.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <>
      <LandingPageV2 />
      <Suspense fallback={null}>
        <AuthModalController />
      </Suspense>
      {/* Dev-only: the M5 embeddable widget script, live on this app's own
          landing page purely so it can be exercised locally without a
          separate host page. Never renders in production -- points at
          jorginho-e-cia/malu, this session's own test company (whichever
          company's allowed_embed_domains needs "localhost" for this to
          work -- that's per-company, not global). */}
      {process.env.NODE_ENV !== "production" ? (
        <Script src="/widget.js" data-company="jorginho-e-cia" data-agent="malu" data-greeting="Oi!👋 Posso te ajudar a achar o produto ideal?" strategy="afterInteractive" />
      ) : null}
    </>
  );
}
