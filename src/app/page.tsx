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
      <script src="https://www.staffra.io/widget.js" data-company="staffra" data-agent="ana" data-greeting="Bom dia!"></script>
    </>
  );
}
