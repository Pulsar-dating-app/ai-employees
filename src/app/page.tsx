import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Script from "next/script";
import { createClient } from "@/lib/supabase/server";
import { LandingPageV2 } from "@/components/landing/landing-page-2";
import { AuthModalController } from "@/components/auth/auth-modal-controller";
import { LandingJsonLd } from "@/components/seo/landing-json-ld";

// `?auth=signup` / `?auth=login` render the same landing with an overlay —
// self-referential canonical so Google folds those query variants into the
// bare `/` rather than treating them as duplicate pages.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

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
      <LandingJsonLd />
      <LandingPageV2 />
      <Suspense fallback={null}>
        <AuthModalController />
      </Suspense>
      {/* Staffra's own chat widget, dogfooded on the landing. `lazyOnload`
          keeps this third-party script off the critical path so it never
          costs LCP/TBT on the most SEO-important page. */}
<script src="http://localhost:3000/widget.js" data-company="jorginho-e-cia" data-agent="ana" data-greeting="Procurando por algo especifico???" data-launcher-src="http://localhost:3000/agents/ana-classic-launcher.webm" data-offset-bottom="40"></script>
    </>
  );
}
